import time
import os

# Set TCP option BEFORE importing cv2
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

import cv2
import sqlalchemy
from sqlalchemy.orm import sessionmaker, declarative_base, relationship
from sqlalchemy import Column, ForeignKey, Integer, String, DateTime
from datetime import datetime, timezone, timedelta
from threading import Thread
import subprocess
import logging
import numpy as np

# --- Logging ---
logging.basicConfig(level=logging.INFO,
                    format='[%(asctime)s] [%(levelname)s] %(message)s',
                    datefmt='%Y-%m-%d %H:%M:%S')
log = logging.getLogger(__name__)


# --- Database Setup ---
def get_db_url():
    try:
        with open("/run/secrets/db_url_secret", "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        log.error("!!! DETECTOR ERROR: 'db_url_secret' file not found. Using fallback.")
        return "postgresql://admin:supersecret@db/cameradb"

DATABASE_URL = get_db_url()
engine = sqlalchemy.create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- Simplified Models (FIXED) ---
class Camera(Base):
    __tablename__ = "cameras"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    path = Column(String, unique=True)
    rtsp_url = Column(String)
    rtsp_substream_url = Column(String, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    motion_type = Column(String, default="off")
    motion_roi = Column(String, nullable=True) 
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
    start_time = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    end_time = Column(DateTime(timezone=True), nullable=True)
    reason = Column(String, default="motion")
    video_path = Column(String, unique=True)
    thumbnail_path = Column(String, nullable=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    camera = relationship("Camera", back_populates="events")
    owner = relationship("User", back_populates="events")

# Ensure tables exist before trying to query them.
Base.metadata.create_all(bind=engine)

# --- Global Dictionaries ---
camera_processors = {}
is_recording = {}

# --- Thumbnail Generation Function ---
def create_thumbnail(video_path, thumb_path):
    try:
        log.info(f"Generating thumbnail for {video_path}...")
        ffmpeg_cmd = [
            'ffmpeg',
            '-i', video_path,
            '-ss', '00:00:01', 
            '-vframes', '1',
            '-q:v', '3',
            '-vf', 'scale=640:-1',
            thumb_path
        ]
        process = subprocess.Popen(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate()
        if process.returncode != 0:
            log.error(f"Failed to create thumbnail: {stderr.decode()}")
            return False
        log.info(f"Successfully created thumbnail: {thumb_path}")
        return True
    except Exception as e:
        log.error(f"Exception creating thumbnail: {e}")
        return False

# --- FFMPEG Recording Function ---
def start_ffmpeg_record(camera):
    path = camera.path
    rtsp_url = camera.rtsp_url 
    
    if is_recording.get(path, False):
        log.info(f"[{path}] Already recording, skipping.")
        return

    log.info(f"[{path}] Starting recording...")
    is_recording[path] = True

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        
        base_filename = f"event_{camera.id}_{now.strftime('%Y%m%d-%H%M%S')}"
        video_filename = f"{base_filename}.mp4"
        thumb_filename = f"{base_filename}.jpg"
        
        video_db_path = f"recordings/{video_filename}" 
        video_abs_path = f"/{video_db_path}"       
        
        thumb_db_path = f"recordings/{thumb_filename}"
        thumb_abs_path = f"/{thumb_db_path}"

        db_event = Event(
            reason="motion (active)",
            video_path=video_db_path,
            camera_id=camera.id,
            user_id=camera.owner_id,
            start_time=now
        )
        db.add(db_event)
        db.commit()
        db.refresh(db_event)
        log.info(f"[{path}] Created Event {db_event.id}. Recording to {video_abs_path}")
        
        ffmpeg_cmd = [
            'ffmpeg',
            '-rtsp_transport', 'tcp',
            '-i', rtsp_url,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-movflags', 'frag_keyframe+empty_moov',
            '-f', 'mp4',
            '-t', '60',
            video_abs_path
        ]

        process = subprocess.Popen(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate() 

        if process.returncode != 0:
            log.error(f"[{path}] ERROR: FFmpeg failed: {stderr.decode()}")
            raise Exception("FFmpeg failed")

        log.info(f"[{path}] Finished recording. Updating DB.")
        
        event_to_update = db.query(Event).filter(Event.id == db_event.id).first()
        if event_to_update:
            event_to_update.end_time = datetime.now(timezone.utc)
            
            if create_thumbnail(video_abs_path, thumb_abs_path):
                event_to_update.thumbnail_path = thumb_db_path
            
            db.commit()
        
    except Exception as e:
        log.error(f"[{path}] ERROR during recording: {e}")
        if 'db_event' in locals() and db_event.id:
            db.rollback()
            event_to_delete = db.query(Event).filter(Event.id == db_event.id).first()
            if event_to_delete:
                db.delete(event_to_delete)
                db.commit()
    finally:
        is_recording[path] = False
        db.close()

# --- Get stream dimensions with ffprobe ---
def get_stream_dimensions(rtsp_url):
    log.info(f"Probing stream dimensions for: {rtsp_url}")
    ffprobe_cmd = [
        'ffprobe',
        '-v', 'error',
        '-rtsp_transport', 'tcp', 
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'csv=p=0:nk=1',
        rtsp_url
    ]
    try:
        process = subprocess.Popen(ffprobe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate(timeout=10) 
        if process.returncode != 0:
            log.error(f"ffprobe failed: {stderr.decode()}")
            return None, None
            
        dims = stdout.decode().strip().split(',')
        if len(dims) == 2:
            return int(dims[0]), int(dims[1])
        else:
            log.error(f"Unexpected ffprobe output: {stdout.decode()}")
            return None, None
    except Exception as e:
        log.error(f"Exception in get_stream_dimensions: {e}")
        return None, None


# --- Motion Detection Processor ---
def process_camera(camera, stop_event):
    path = camera.path
    rtsp_url = camera.rtsp_substream_url if camera.rtsp_substream_url else camera.rtsp_url
    
    try:
        roi_set = set(int(i) for i in camera.motion_roi.split(',') if i)
    except (AttributeError, ValueError):
        roi_set = set()
    
    log.info(f"[{path}] Starting motion detection for: {rtsp_url}")

    if not roi_set:
        log.warning(f"[{path}] No motion ROI set. Motion will not be detected.")
    else:
        log.info(f"[{path}] Monitoring {len(roi_set)} ROI cells.")

    W, H = get_stream_dimensions(rtsp_url)
    if W is None or H is None:
        log.error(f"[{path}] Could not get stream dimensions. Aborting thread.")
        return

    log.info(f"[{path}] Stream dimensions detected: {W}x{H}")

    ffmpeg_cmd = [
        'ffmpeg',
        '-rtsp_transport', 'tcp',
        '-probesize', '32',
        '-analyzeduration', '0',
        '-fflags', 'nobuffer',
        '-i', rtsp_url,
        '-f', 'rawvideo',      
        '-pix_fmt', 'bgr24',   
        '-vcodec', 'rawvideo',
        '-an', '-sn',
        '-'
    ]
    
    p = subprocess.Popen(ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    
    avg_frame = None
    last_record_time = 0
    RECORD_COOLDOWN = 60
    
    frame_size = W * H * 3
    cell_width = W // 10
    cell_height = H // 10
    
    last_analysis_time = 0

    try:
        while not stop_event.is_set():
            in_bytes = p.stdout.read(frame_size)
            
            if not in_bytes or len(in_bytes) != frame_size:
                log.warning(f"[{path}] Stream ended or pipe broke. Retrying...")
                p.kill() 
                time.sleep(5)
                p = subprocess.Popen(ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                avg_frame = None 
                continue
            
            now = time.time()
            if now - last_analysis_time < 1.0: # 1.0 second
                continue 
            
            last_analysis_time = now

            frame = np.frombuffer(in_bytes, dtype=np.uint8).reshape((H, W, 3))
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (21, 21), 0)

            if avg_frame is None:
                avg_frame = gray.copy().astype("float")
                continue

            cv2.accumulateWeighted(gray, avg_frame, 0.5)
            frame_delta = cv2.absdiff(gray, cv2.convertScaleAbs(avg_frame))
            thresh = cv2.threshold(frame_delta, 10, 255, cv2.THRESH_BINARY)[1]
            thresh = cv2.dilate(thresh, None, iterations=2)
            
            contours, _ = cv2.findContours(thresh.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # ========================================================
            # --- BEGIN REPLACEMENT: Bounding Box Overlap Logic ---
            # ========================================================
            motion_detected = False
            if roi_set:
                for c in contours:
                    if cv2.contourArea(c) < 100: # Filter out tiny noise
                        continue
                    
                    # 1. Get the bounding box of the motion
                    (x, y, w, h) = cv2.boundingRect(c)
                    
                    # 2. Find which grid cells this box touches
                    start_col = max(0, min(x // cell_width, 9))
                    end_col = max(0, min((x + w) // cell_width, 9))
                    start_row = max(0, min(y // cell_height, 9))
                    end_row = max(0, min((y + h) // cell_height, 9))

                    # 3. Check if ANY of those cells are in our ROI
                    found = False
                    for row in range(start_row, end_row + 1):
                        for col in range(start_col, end_col + 1):
                            cell_id = (row * 10) + col
                            if cell_id in roi_set:
                                motion_detected = True
                                found = True
                                break
                        if found:
                            break
                    
                    if found:
                        break # Found motion, no need to check other contours
            # ========================================================
            # --- END REPLACEMENT ---
            # ========================================================
            
            is_currently_recording = is_recording.get(path, False)

            if motion_detected and not is_currently_recording:
                if (now - last_record_time) > RECORD_COOLDOWN:
                    log.info(f"[{path}] Motion detected! Triggering recording.")
                    last_record_time = now
                    record_thread = Thread(target=start_ffmpeg_record, args=(camera,), daemon=True)
                    record_thread.start()

    except Exception as e:
        log.error(f"[{path}] ERROR in processing loop: {e}")
    finally:
        log.info(f"[{path}] Stopping motion detection. Killing ffmpeg process.")
        p.kill() 


# --- Auto-Cleanup Function ---
def cleanup_old_events(db: SessionLocal):
    try:
        RETENTION_DAYS = 30
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
        
        events_to_delete = db.query(Event).filter(Event.start_time < cutoff_date).all()
        
        if not events_to_delete:
            return

        log.info(f"--- CLEANUP: Found {len(events_to_delete)} events older than {RETENTION_DAYS} days ---")
        
        deleted_count = 0
        for event in events_to_delete:
            try:
                abs_video_path = f"/{event.video_path}"
                if os.path.exists(abs_video_path):
                    os.remove(abs_video_path)
                    log.info(f"--- CLEANUP: Deleted file {abs_video_path} ---")
                
                if event.thumbnail_path:
                    abs_thumb_path = f"/{event.thumbnail_path}"
                    if os.path.exists(abs_thumb_path):
                        os.remove(abs_thumb_path)
                        log.info(f"--- CLEANUP: Deleted thumb {abs_thumb_path} ---")
                
                db.delete(event)
                deleted_count += 1

            except Exception as e:
                log.error(f"--- CLEANUP: Error deleting event {event.id}: {e} ---")
                db.rollback() 
                
        db.commit()
        log.info(f"--- CLEANUP: Successfully deleted {deleted_count} events ---")

    except Exception as e:
        log.error(f"--- CLEANUP: Fatal error in cleanup task: {e} ---")
        db.rollback()


# --- Main Loop ---
def main_loop():
    log.info("--- Motion Detector Service Started ---")
    from threading import Event as ThreadEvent

    while True:
        db = SessionLocal()
        try:
            active_cameras = db.query(Camera).filter(Camera.motion_type == "active").all()
            active_camera_paths = {c.path for c in active_cameras}

            for cam in active_cameras:
                if cam.path in camera_processors:
                    old_roi = camera_processors[cam.path]["roi_set"]
                    try:
                        new_roi_set = set(int(i) for i in cam.motion_roi.split(',') if i)
                    except (AttributeError, ValueError):
                        new_roi_set = set()
                    
                    if old_roi != new_roi_set:
                        log.info(f"[{cam.path}] ROI changed. Restarting processor...")
                        camera_processors[cam.path]["stop_event"].set()
                        camera_processors[cam.path]["thread"].join(timeout=5)
                        del camera_processors[cam.path]

                if cam.path not in camera_processors:
                    log.info(f"Found new active camera: {cam.name}")
                    stop_event = ThreadEvent()
                    thread = Thread(target=process_camera, args=(cam, stop_event), daemon=True)
                    try:
                        current_roi = set(int(i) for i in cam.motion_roi.split(',') if i)
                    except (AttributeError, ValueError):
                        current_roi = set()
                    camera_processors[cam.path] = {
                        "thread": thread, 
                        "stop_event": stop_event,
                        "roi_set": current_roi
                    }
                    thread.start()

            for path in list(camera_processors.keys()):
                if path not in active_camera_paths:
                    log.info(f"Camera no longer active: {path}. Stopping thread...")
                    camera_processors[path]["stop_event"].set()
                    camera_processors[path]["thread"].join(timeout=5)
                    del camera_processors[path]
            
            cleanup_old_events(db)

        except Exception as e:
            log.error(f"ERROR in main loop: {e}")
        finally:
            db.close()
        
        time.sleep(30)

if __name__ == "__main__":
    main_loop()