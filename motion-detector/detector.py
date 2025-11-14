import cv2
import time
import os
import sqlalchemy
from sqlalchemy.orm import sessionmaker, declarative_base, relationship
from sqlalchemy import Column, ForeignKey, Integer, String, DateTime
from datetime import datetime, timezone
from threading import Thread
import subprocess

# --- Database Setup ---
def get_db_url():
    try:
        with open("/run/secrets/db_url_secret", "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        print("!!! DETECTOR ERROR: 'db_url_secret' file not found. Using fallback.", flush=True)
        return "postgresql://admin:supersecret@db/cameradb"

DATABASE_URL = get_db_url()
engine = sqlalchemy.create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- Simplified Models (Must match your backend/models.py) ---
class Camera(Base):
    __tablename__ = "cameras"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    path = Column(String, unique=True)
    rtsp_url = Column(String)
    rtsp_substream_url = Column(String, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    motion_type = Column(String, default="off")
    events = relationship("Event", back_populates="camera")
    owner = relationship("User", back_populates="cameras")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    events = relationship("Event", back_populates="owner")
    cameras = relationship("Camera", back_populates="owner")

class Event(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    reason = Column(String, default="motion")
    video_path = Column(String, unique=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    camera = relationship("Camera", back_populates="events")
    owner = relationship("User", back_populates="events")

# --- Global Dictionaries ---
camera_processors = {}
is_recording = {}

# --- FFMPEG Recording Function ---
def start_ffmpeg_record(camera):
    """
    Starts an FFmpeg process to record the stream.
    This runs in a separate thread.
    """
    path = camera.path
    # ALWAYS record the high-quality main stream
    rtsp_url = camera.rtsp_url 
    
    if is_recording.get(path, False):
        print(f"[{path}] Already recording, skipping.", flush=True)
        return

    print(f"[{path}] Starting recording...", flush=True)
    is_recording[path] = True

    db = SessionLocal()
    try:
        # 1. Create Event in DB
        now = datetime.now(timezone.utc)
        video_filename = f"event_{camera.id}_{now.strftime('%Y%m%d-%H%M%S')}.mp4"
        video_db_path = f"recordings/{video_filename}" # Relative path for DB/URL
        video_abs_path = f"/{video_db_path}"       # Absolute path in container

        db_event = Event(
            reason="motion (active)", # Set new reason
            video_path=video_db_path,
            camera_id=camera.id,
            user_id=camera.owner_id,
            start_time=now
        )
        db.add(db_event)
        db.commit()
        db.refresh(db_event) # Get the new event ID
        print(f"[{path}] Created Event {db_event.id}. Recording to {video_abs_path}", flush=True)
        
        # 2. Start FFmpeg
        ffmpeg_cmd = [
            'ffmpeg',
            '-rtsp_transport', 'tcp',
            '-i', rtsp_url,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-movflags', 'frag_keyframe+empty_moov',
            '-f', 'mp4',
            '-t', '60', # Record for 60 seconds
            video_abs_path
        ]

        process = subprocess.Popen(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate() # Wait for process to finish

        if process.returncode != 0:
            print(f"[{path}] ERROR: FFmpeg failed: {stderr.decode()}", flush=True)
            raise Exception("FFmpeg failed")

        # 3. Update event with end time
        print(f"[{path}] Finished recording. Updating DB.", flush=True)
        event_to_update = db.query(Event).filter(Event.id == db_event.id).first()
        if event_to_update:
            event_to_update.end_time = datetime.now(timezone.utc)
            db.commit()
        
    except Exception as e:
        print(f"[{path}] ERROR during recording: {e}", flush=True)
        if 'db_event' in locals() and db_event.id:
            db.rollback()
            event_to_delete = db.query(Event).filter(Event.id == db_event.id).first()
            if event_to_delete:
                db.delete(event_to_delete)
                db.commit()
    finally:
        is_recording[path] = False
        db.close()

# --- Motion Detection Processor ---
def process_camera(camera, stop_event):
    """A dedicated function to process a single camera stream."""
    path = camera.path
    
    # Use substream if it exists, otherwise fall back to main stream
    rtsp_url = camera.rtsp_substream_url if camera.rtsp_substream_url else camera.rtsp_url
    use_substream = bool(camera.rtsp_substream_url)
    
    print(f"[{path}] Starting motion detection for: {rtsp_url}", flush=True)
    if use_substream:
        print(f"[{path}] Using high-efficiency SUBSTREAM for detection.", flush=True)
    else:
        print(f"[{path}] WARNING: No substream provided. Using main stream for detection (HIGH CPU).", flush=True)

    cap = cv2.VideoCapture(rtsp_url)
    if not cap.isOpened():
        print(f"[{path}] ERROR: Could not open stream.", flush=True)
        return

    os.makedirs("/recordings", exist_ok=True)
    
    avg_frame = None
    last_record_time = 0
    RECORD_COOLDOWN = 60 # Cooldown of 60 seconds between recordings

    while not stop_event.is_set():
        try:
            ret, frame = cap.read()
            if not ret:
                print(f"[{path}] Stream disconnected. Retrying in 5s...", flush=True)
                time.sleep(5)
                cap.release()
                cap = cv2.VideoCapture(rtsp_url)
                continue
            
            # --- SIMPLE MOTION DETECTION ---
            # If we aren't using a substream, resize the frame to save CPU
            if not use_substream:
                frame = cv2.resize(frame, (640, 360)) # small 16:9 frame
            
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (21, 21), 0)

            if avg_frame is None:
                avg_frame = gray.copy().astype("float")
                continue

            cv2.accumulateWeighted(gray, avg_frame, 0.5)
            frame_delta = cv2.absdiff(gray, cv2.convertScaleAbs(avg_frame))
            thresh = cv2.threshold(frame_delta, 15, 255, cv2.THRESH_BINARY)[1] # Increased threshold to 15
            thresh = cv2.dilate(thresh, None, iterations=2)
            
            contours, _ = cv2.findContours(thresh.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            motion_detected = False
            for c in contours:
                if cv2.contourArea(c) > 2000: # Increased area to 2000 to catch only large motion
                    motion_detected = True
                    break
            # --- END SIMPLE MOTION DETECTION ---

            now = time.time()
            is_currently_recording = is_recording.get(path, False)

            if motion_detected and not is_currently_recording:
                if (now - last_record_time) > RECORD_COOLDOWN:
                    print(f"[{path}] Motion detected! Triggering recording.", flush=True)
                    last_record_time = now
                    record_thread = Thread(target=start_ffmpeg_record, args=(camera,), daemon=True)
                    record_thread.start()
                # else:
                #     print(f"[{path}] Motion detected, but in cooldown.", flush=True)

            # --- CPU SAVER ---
            # Scan 1x per second. This is the biggest CPU optimization.
            time.sleep(1) 

        except Exception as e:
            print(f"[{path}] ERROR in processing loop: {e}", flush=True)
            if stop_event.is_set():
                break
            time.sleep(5)
            cap.release()
            cap = cv2.VideoCapture(rtsp_url)

    print(f"[{path}] Stopping motion detection.", flush=True)
    cap.release()

# --- Main Loop ---
def main_loop():
    """Fetches cameras from DB and manages processor threads."""
    print("--- Motion Detector Service Started ---", flush=True)
    from threading import Event as ThreadEvent

    while True:
        db = SessionLocal()
        try:
            active_cameras = db.query(Camera).filter(Camera.motion_type == "active").all()
            active_camera_paths = {c.path for c in active_cameras}

            for cam in active_cameras:
                if cam.path not in camera_processors:
                    print(f"Found new active camera: {cam.name}", flush=True)
                    stop_event = ThreadEvent()
                    thread = Thread(target=process_camera, args=(cam, stop_event), daemon=True)
                    thread.start()
                    camera_processors[cam.path] = {"thread": thread, "stop_event": stop_event}

            for path in list(camera_processors.keys()):
                if path not in active_camera_paths:
                    print(f"Camera no longer active: {path}. Stopping thread...", flush=True)
                    camera_processors[path]["stop_event"].set()
                    camera_processors[path]["thread"].join(timeout=5)
                    del camera_processors[path]

        except Exception as e:
            print(f"ERROR in main loop: {e}", flush=True)
        finally:
            db.close()
        
        time.sleep(30) # Check for new/removed cameras every 30 seconds

if __name__ == "__main__":
    main_loop()