import time
import os
import shutil
import glob
import sqlalchemy
from sqlalchemy.orm import sessionmaker, declarative_base, relationship
from sqlalchemy import Column, ForeignKey, Integer, String, DateTime, Boolean
from datetime import datetime, timezone, timedelta
from threading import Thread
import subprocess
import logging
import uvicorn
from fastapi import FastAPI, HTTPException
import numpy as np
# --- REMOVED: import models --- 

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO,
                    format='[%(asctime)s] [%(levelname)s] %(message)s',
                    datefmt='%Y-%m-%d %H:%M:%S')
log = logging.getLogger(__name__)

# --- Global Dictionaries ---
running_motion_processes = {}
running_continuous_processes = {}
active_recordings = {}

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

# --- Simplified Models ---
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
    motion_sensitivity = Column(Integer, default=50)
    continuous_recording = Column(Boolean, default=False) 
    owner = relationship("User", back_populates="cameras")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
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

# ====================================================================
#                 Internal API (Receives webhooks from 'motion')
# ====================================================================

app = FastAPI()

@app.post("/start_record/{camera_id}")
async def start_record_webhook(camera_id: int):
    log.info(f"[{camera_id}] Received motion start webhook from 'motion' daemon")
    
    if camera_id in active_recordings:
        log.warning(f"[{camera_id}] Already recording, ignoring duplicate start signal.")
        return {"message": "Already recording"}
        
    db = SessionLocal()
    try:
        camera = db.query(Camera).filter(Camera.id == camera_id).first()
        if not camera:
            log.error(f"[{camera_id}] Camera not found in database!")
            raise HTTPException(status_code=404, detail="Camera not found")
        
        rtsp_url = camera.rtsp_url 
        now = datetime.now(timezone.utc)
        
        base_filename = f"event_{camera.id}_{now.strftime('%Y%m%d-%H%M%S')}"
        video_filename = f"{base_filename}.mp4"
        thumb_filename = f"{base_filename}.jpg"
        
        video_db_path = f"recordings/{video_filename}" 
        video_abs_path = f"/{video_db_path}"       
        thumb_db_path = f"recordings/{thumb_filename}"
        
        db_event = Event(
            reason="motion (active)",
            video_path=video_db_path,
            camera_id=camera.id,
            user_id=camera.owner_id,
            start_time=now,
            thumbnail_path=None # Don't set thumb yet
        )
        db.add(db_event)
        db.commit()
        db.refresh(db_event)
        log.info(f"[{camera_id}] Created Event {db_event.id}. Recording to {video_abs_path}")
        
        ffmpeg_cmd = [
            'ffmpeg',
            '-rtsp_transport', 'tcp',
            '-fflags', 'nobuffer',        
            '-analyzeduration', '500000', 
            '-probesize', '1000000',      
            '-i', rtsp_url,
            '-c:v', 'copy',
            '-c:a', 'copy',
            '-movflags', 'frag_keyframe+empty_moov',
            '-f', 'mp4',
            video_abs_path
        ]

        process = subprocess.Popen(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        active_recordings[camera_id] = {
            "process": process,
            "event_id": db_event.id,
            "video_path": video_abs_path,
            "thumb_path": thumb_db_path,
            "thumb_abs_path": f"/{thumb_db_path}"
        }
        return {"message": f"Recording started for event {db_event.id}"}
        
    except Exception as e:
        log.error(f"[{camera_id}] ERROR starting record: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/stop_record/{camera_id}")
async def stop_record_webhook(camera_id: int):
    log.info(f"[{camera_id}] Received motion end webhook from 'motion' daemon")
    
    if camera_id not in active_recordings:
        log.warning(f"[{camera_id}] No active recording found to stop.")
        return {"message": "No active recording to stop"}
        
    recording = active_recordings.pop(camera_id)
    
    try:
        recording["process"].terminate()
        stdout, stderr = recording["process"].communicate(timeout=30)
        log.info(f"[{camera_id}] FFmpeg process terminated for Event {recording['event_id']}")
        
        stderr_output = stderr.decode('utf-8')
        if "No such file or directory" in stderr_output or "Error" in stderr_output:
             log.error(f"[{camera_id}] FFmpeg recording process failed: {stderr_output}")
             return {"message": "Recording process failed"}

    except Exception as e:
        log.error(f"[{camera_id}] Error terminating ffmpeg: {e}. Killing.")
        recording["process"].kill()

    db = SessionLocal()
    try:
        event = db.query(Event).filter(Event.id == recording["event_id"]).first()
        if event:
            event.end_time = datetime.now(timezone.utc)
            db.commit()
            log.info(f"[{camera_id}] Updated end_time for Event {event.id}")
            
            thumb_thread = Thread(
                target=finalize_event, 
                args=(
                    recording["event_id"], 
                    recording["video_path"], 
                    recording["thumb_abs_path"],
                    recording["thumb_path"]
                ),
                daemon=True
            )
            thumb_thread.start()
        
        return {"message": f"Recording stopped for event {event.id}"}
    except Exception as e:
        log.error(f"[{camera_id}] ERROR updating event end_time: {e}")
        db.rollback()
        return {"message": "Error stopping recording"}
    finally:
        db.close()

def finalize_event(event_id, video_path, thumb_abs_path, thumb_db_path):
    if create_thumbnail(video_path, thumb_abs_path):
        db = SessionLocal()
        try:
            event = db.query(Event).filter(Event.id == event_id).first()
            if event:
                event.thumbnail_path = thumb_db_path
                db.commit()
                log.info(f"[{event_id}] DB Updated with thumbnail path")
        except Exception as e:
            log.error(f"[{event_id}] Failed to update thumbnail in DB: {e}")
        finally:
            db.close()

def create_thumbnail(video_path, thumb_path):
    try:
        time.sleep(1)
        log.info(f"Generating thumbnail for {video_path}...")
        ffmpeg_cmd = [
            'ffmpeg',
            '-i', video_path,
            '-ss', '00:00:01', 
            '-vframes', '1',
            '-q:v', '3',
            '-vf', 'scale=640:-1,format=yuvj420p',
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

# ====================================================================
#                 24/7 Continuous Recording Logic
# ====================================================================

def start_continuous_recording(camera):
    output_dir = f"/recordings/continuous/{camera.id}"
    os.makedirs(output_dir, exist_ok=True)
    
    segment_time = "900"
    output_pattern = f"{output_dir}/%Y%m%d-%H%M%S.mp4"

    log.info(f"[{camera.id}] Starting 24/7 continuous recording...")

    ffmpeg_cmd = [
        'ffmpeg',
        '-rtsp_transport', 'tcp',
        '-stimeout', '5000000', 
        '-i', camera.rtsp_url,
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-f', 'segment',
        '-segment_time', segment_time,
        '-strftime', '1',
        '-reset_timestamps', '1',
        output_pattern
    ]
    
    process = subprocess.Popen(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return process

# ====================================================================
#                 Disk Manager (Auto-Cleanup)
# ====================================================================

def disk_manager_loop():
    log.info("--- Disk Manager Started ---")
    MIN_FREE_BYTES = 10 * 1024 * 1024 * 1024 
    TARGET_FREE_BYTES = 15 * 1024 * 1024 * 1024 

    while True:
        try:
            usage = shutil.disk_usage("/recordings")
            
            if usage.free < MIN_FREE_BYTES:
                log.warning(f"LOW DISK SPACE: {usage.free / 1024**3:.2f} GB free. Starting cleanup...")
                files = glob.glob("/recordings/continuous/**/*.mp4", recursive=True)
                files.sort(key=os.path.getmtime)
                
                deleted_count = 0
                freed_bytes = 0
                
                for file_path in files:
                    try:
                        size = os.path.getsize(file_path)
                        os.remove(file_path)
                        deleted_count += 1
                        freed_bytes += size
                        
                        if (usage.free + freed_bytes) > TARGET_FREE_BYTES:
                            break
                    except Exception as e:
                        log.error(f"Error deleting file {file_path}: {e}")
                
                log.info(f"Cleanup complete. Deleted {deleted_count} files, freed {freed_bytes / 1024**3:.2f} GB.")
            
        except Exception as e:
            log.error(f"Error in disk_manager_loop: {e}")
        
        time.sleep(60) 

# ====================================================================
#                 Mask & Config Generation
# ====================================================================

def generate_mask_file(roi_string: str, mask_path: str):
    try:
        mask = np.zeros((10, 10), dtype=np.uint8)
        if roi_string:
            selected_cells = set(int(i) for i in roi_string.split(',') if i)
            for cell_id in selected_cells:
                if 0 <= cell_id < 100:
                    row = cell_id // 10
                    col = cell_id % 10
                    mask[row, col] = 255
        
        with open(mask_path, 'wb') as f:
            f.write(b"P5\n")
            f.write(b"10 10\n")
            f.write(b"255\n")
            f.write(mask.tobytes())
        return True
    except Exception as e:
        log.error(f"Failed to generate mask file: {e}")
        return False

def generate_motion_conf(camera, conf_path, mask_path):
    rtsp_url = camera.rtsp_substream_url if camera.rtsp_substream_url else camera.rtsp_url
    
    has_mask = False
    if camera.motion_roi:
        if generate_mask_file(camera.motion_roi, mask_path):
            has_mask = True
    
    sensitivity = camera.motion_sensitivity if camera.motion_sensitivity else 50
    threshold = int(5000 - ((sensitivity / 100.0) * 4700))

    config_content = f"""
daemon off
setup_mode off
log_level 6
log_type file
log_file /var/log/motion/{camera.id}.log

netcam_url {rtsp_url}
rtsp_transport tcp

on_event_start curl -X POST http://localhost:8001/start_record/{camera.id}
on_event_end curl -X POST http://localhost:8001/stop_record/{camera.id}

{"mask_file " + mask_path if has_mask else ""}

threshold {threshold} 
despeckle Eedl
minimum_motion_frames 1 
event_gap 30
pre_capture 0
post_capture 0

output_pictures off
output_debug_pictures off
ffmpeg_output_movies off
ffmpeg_output_debug_movies off
"""
    try:
        with open(conf_path, "w") as f:
            f.write(config_content)
        return True
    except Exception as e:
        log.error(f"[{camera.id}] Failed to write motion.conf: {e}")
        return False

# ====================================================================
#                 Process Manager
# ====================================================================

def process_manager_loop():
    log.info("--- Process Manager Started ---")
    
    while True:
        db = SessionLocal()
        try:
            cameras = db.query(Camera).all()
            
            active_motion_cams = [c for c in cameras if c.motion_type == "active"]
            active_motion_ids = {c.id for c in active_motion_cams}

            for cam in active_motion_cams:
                if cam.id not in running_motion_processes:
                    log.info(f"[{cam.id}] Starting 'motion' daemon.")
                    conf_path = f"/app/motion_confs/{cam.id}.conf"
                    mask_path = f"/app/motion_confs/{cam.id}_mask.pgm" 
                    
                    if generate_motion_conf(cam, conf_path, mask_path):
                        motion_cmd = ['motion', '-c', conf_path]
                        p = subprocess.Popen(motion_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                        running_motion_processes[cam.id] = p

            for cam_id in list(running_motion_processes.keys()):
                if cam_id not in active_motion_ids:
                    log.info(f"[{cam_id}] Stopping 'motion' daemon.")
                    p = running_motion_processes.pop(cam_id)
                    p.terminate()
                    if cam_id in active_recordings:
                         try:
                            subprocess.run(["curl", "-X", "POST", f"http://localhost:8001/stop_record/{cam_id}"], timeout=5)
                         except: pass

            continuous_cams = [c for c in cameras if c.continuous_recording]
            continuous_ids = {c.id for c in continuous_cams}

            for cam in continuous_cams:
                if cam.id not in running_continuous_processes:
                    p = start_continuous_recording(cam)
                    running_continuous_processes[cam.id] = p
                else:
                    p = running_continuous_processes[cam.id]
                    if p.poll() is not None:
                        log.warning(f"[{cam.id}] Continuous recording died. Restarting...")
                        p = start_continuous_recording(cam)
                        running_continuous_processes[cam.id] = p

            for cam_id in list(running_continuous_processes.keys()):
                if cam_id not in continuous_ids:
                    log.info(f"[{cam_id}] Stopping 24/7 recording.")
                    p = running_continuous_processes.pop(cam_id)
                    p.terminate()

        except Exception as e:
            log.error(f"ERROR in process_manager_loop: {e}")
        finally:
            db.close()
        
        time.sleep(30)

if __name__ == "__main__":
    try:
        os.makedirs("/app/motion_confs", exist_ok=True)
        manager_thread = Thread(target=process_manager_loop, daemon=True)
        manager_thread.start()
        disk_thread = Thread(target=disk_manager_loop, daemon=True)
        disk_thread.start()
        log.info("--- Starting Internal Webhook API on port 8001 ---")
        uvicorn.run(app, host="0.0.0.0", port=8001)
    except Exception as e:
        log.error(f"Fatal error in main entrypoint: {e}")