import cv2
import requests
import threading
import time
import logging
import os
import shutil

# --- CPU THREAD LIMITING ---
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

from ultralytics import YOLO

# --- CONFIGURATION ---
API_URL = "http://backend:8080/api"
RTSP_BASE = "rtsp://admin:mysecretpassword@mediamtx:8554" 
# Switch to OpenVINO for Intel CPU optimization
MODEL_NAME = "yolov8n_openvino_model" 
PT_NAME = "yolov8n.pt"

# OPTIMIZATIONS
FRAME_SKIP = 30       
CONFIDENCE = 0.65     
IMGSZ = 320           

os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

logging.basicConfig(level=logging.INFO, format="[AI] %(message)s")
log = logging.getLogger("ai-detector")

watchers = {}

def get_cameras():
    try:
        resp = requests.get(f"{API_URL}/internal/cameras", timeout=2)
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass 
    return []

def process_camera(camera, stop_event):
    cam_id = camera['id']
    cam_name = camera['name']

    if camera.get('rtsp_substream_url') and len(camera['rtsp_substream_url']) > 5:
        stream_url = camera['rtsp_substream_url']
        log.info(f"[{cam_name}] Connecting to Substream: {stream_url}")
    else:
        stream_url = f"{RTSP_BASE}/{camera['path']}"
        log.info(f"[{cam_name}] Connecting to Main Stream: {stream_url}")
    
    # Load OpenVINO model (Task must be 'detect')
    model = YOLO(MODEL_NAME, task='detect')
    cap = cv2.VideoCapture(stream_url)
    
    # Check Resolution
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    log.info(f"[{cam_name}] Stream Resolution: {width}x{height}")
    
    if width > 1280:
        log.warning(f"[{cam_name}] WARNING: High resolution detected! This will cause high CPU usage. Please use a 640x480 substream.")
    
    frame_count = 0
    is_recording = False
    cooldown = 0
    
    while not stop_event.is_set():
        frame_count += 1

        # Skip frames
        if frame_count % FRAME_SKIP != 0:
            cap.grab()
            time.sleep(0.02) # Sleep 20ms to yield CPU
            continue

        # Decode the frame we want
        success, frame = cap.retrieve()
        
        if not success:
            log.warning(f"[{cam_name}] Signal lost. Retrying in 10s...")
            time.sleep(10)
            cap.open(stream_url)
            continue

        # Resize
        small_frame = cv2.resize(frame, (IMGSZ, IMGSZ))

        # Inference (OpenVINO)
        results = model(small_frame, classes=[0], verbose=False, conf=CONFIDENCE, imgsz=IMGSZ)
        
        detected = False
        for result in results:
            if len(result.boxes) > 0:
                detected = True
                break

        if detected:
            cooldown = 5 
            if not is_recording:
                log.info(f"[{cam_name}] PERSON DETECTED! Recording started.")
                try:
                    requests.post(f"{API_URL}/webhook/motion/start/{cam_id}", timeout=1)
                except: pass
                is_recording = True
        else:
            if is_recording:
                if cooldown > 0:
                    cooldown -= 1
                else:
                    log.info(f"[{cam_name}] Clear. Recording stopped.")
                    try:
                        requests.post(f"{API_URL}/webhook/motion/end/{cam_id}", timeout=1)
                    except: pass
                    is_recording = False

    cap.release()
    log.info(f"[{cam_name}] AI Watcher Stopped")

def main():
    # --- FIX: Declare global at the top ---
    global MODEL_NAME
    
    log.info("--- AI Detector Starting (OpenVINO Mode) ---")
    
    # Auto-Export to OpenVINO if missing
    if not os.path.exists(MODEL_NAME):
        log.info("Exporting model to OpenVINO for Intel CPU optimization...")
        try:
            model = YOLO(PT_NAME)
            model.export(format="openvino", imgsz=IMGSZ)
            log.info("Export complete.")
        except Exception as e:
            log.error(f"Export failed: {e}. Falling back to PyTorch default.")
            MODEL_NAME = PT_NAME

    while True:
        cameras = get_cameras()
        active_ids = set()

        for cam in cameras:
            cid = cam['id']
            
            if cam.get('motion_type') == 'webhook':
                active_ids.add(cid)
                
                if cid not in watchers:
                    stop_event = threading.Event()
                    t = threading.Thread(target=process_camera, args=(cam, stop_event))
                    t.daemon = True
                    t.start()
                    watchers[cid] = stop_event
            else:
                if cid in watchers:
                    log.info(f"Camera {cam['name']} AI disabled. Stopping...")
                    watchers[cid].set()
                    del watchers[cid]
        
        for cid in list(watchers.keys()):
            if cid not in active_ids:
                watchers[cid].set()
                del watchers[cid]

        time.sleep(10)

if __name__ == "__main__":
    main()