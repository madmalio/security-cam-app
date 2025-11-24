import cv2
import requests
import threading
import time
import logging
import os
import shutil
import numpy as np

# --- CPU LIMITS ---
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

from ultralytics import YOLO

# --- CONFIGURATION ---
API_URL = "http://backend:8080/api"
RTSP_BASE = "rtsp://admin:mysecretpassword@mediamtx:8554" 
MODEL_NAME = "yolov8n_openvino_model" 
PT_NAME = "yolov8n.pt"

# --- TUNING ---
FRAME_SKIP = 15       
CONFIDENCE = 0.60     
IMGSZ = 320           
OBJECT_MOTION_THRESHOLD = 50 
GLOBAL_MOTION_THRESHOLD = 1000 

os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

logging.basicConfig(level=logging.INFO, format="[AI] %(message)s")
log = logging.getLogger("ai-detector")

def get_cameras():
    try:
        resp = requests.get(f"{API_URL}/internal/cameras", timeout=2)
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass 
    return []

def get_config_signature(camera):
    """
    Creates a unique string representing the camera's AI configuration.
    If this string changes, we know we need to restart the detector.
    """
    return f"{camera.get('ai_classes')}|{camera.get('rtsp_substream_url')}|{camera.get('rtsp_url')}"

def process_camera(camera, stop_event):
    cam_id = camera['id']
    cam_name = camera['name']

    target_classes = [0] 
    if camera.get('ai_classes'):
        try:
            target_classes = [int(x) for x in camera['ai_classes'].split(',') if x.strip()]
        except: pass
    
    log.info(f"[{cam_name}] Started. Watching for classes: {target_classes}")

    if camera.get('rtsp_substream_url') and len(camera['rtsp_substream_url']) > 5:
        stream_url = camera['rtsp_substream_url']
    else:
        stream_url = f"{RTSP_BASE}/{camera['path']}"
    
    model = YOLO(MODEL_NAME, task='detect')
    cap = cv2.VideoCapture(stream_url)
    
    frame_count = 0
    is_recording = False
    cooldown = 0
    prev_gray = None
    
    while not stop_event.is_set():
        frame_count += 1

        if frame_count % FRAME_SKIP != 0:
            cap.grab()
            time.sleep(0.01)
            continue

        success, frame = cap.retrieve()
        if not success:
            log.warning(f"[{cam_name}] Signal lost. Retrying in 10s...")
            time.sleep(10)
            cap.open(stream_url)
            prev_gray = None
            continue

        small_frame = cv2.resize(frame, (IMGSZ, IMGSZ))
        gray = cv2.cvtColor(small_frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (21, 21), 0)
        
        motion_mask = None
        global_motion_score = 0

        if prev_gray is not None:
            delta = cv2.absdiff(prev_gray, gray)
            motion_mask = cv2.threshold(delta, 25, 255, cv2.THRESH_BINARY)[1]
            global_motion_score = np.count_nonzero(motion_mask)
        
        prev_gray = gray

        # Global Gating Optimization
        if global_motion_score < GLOBAL_MOTION_THRESHOLD and not is_recording:
             continue 

        # Run Inference
        results = model(small_frame, classes=target_classes, verbose=False, conf=CONFIDENCE, imgsz=IMGSZ)
        
        valid_detection_label = ""
        
        for result in results:
            for box in result.boxes:
                cls_id = int(box.cls[0])
                if cls_id in target_classes:
                    label = model.names[cls_id]
                    
                    if motion_mask is not None:
                        x1, y1, x2, y2 = box.xyxy[0].int().tolist()
                        h, w = motion_mask.shape
                        x1, y1 = max(0, x1), max(0, y1)
                        x2, y2 = min(w, x2), min(h, y2)
                        
                        obj_motion = motion_mask[y1:y2, x1:x2]
                        moving_pixels = cv2.countNonZero(obj_motion)
                        
                        if moving_pixels > OBJECT_MOTION_THRESHOLD:
                            valid_detection_label = label
                            break 
                    else:
                        valid_detection_label = label
                        break

            if valid_detection_label: break

        # Trigger Logic
        if valid_detection_label:
            cooldown = 10 
            if not is_recording:
                log.info(f"[{cam_name}] MOVING {valid_detection_label.upper()}! Recording started.")
                try:
                    requests.post(f"{API_URL}/webhook/motion/start/{cam_id}?label={valid_detection_label}", timeout=1)
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
    log.info(f"[{cam_name}] Thread stopped.")

def main():
    global MODEL_NAME
    log.info("--- AI Detector Starting (Dynamic Reload Active) ---")
    
    if os.path.exists(MODEL_NAME):
        shutil.rmtree(MODEL_NAME)

    try:
        model = YOLO(PT_NAME)
        model.export(format="openvino", imgsz=IMGSZ)
    except Exception:
        MODEL_NAME = PT_NAME

    # Map: cam_id -> { 'stop_event': Event, 'config_sig': str }
    watchers = {}
    
    while True:
        cameras = get_cameras()
        active_ids = set()

        for cam in cameras:
            cid = cam['id']
            
            if cam.get('motion_type') == 'webhook':
                active_ids.add(cid)
                new_sig = get_config_signature(cam)
                
                # 1. Check if already running
                if cid in watchers:
                    # 2. Check if config changed
                    if watchers[cid]['config_sig'] != new_sig:
                        log.info(f"[{cam['name']}] Config changed. Restarting...")
                        watchers[cid]['stop_event'].set()
                        del watchers[cid]
                        # Will fall through to creation block below
                
                # 3. Create new watcher if needed
                if cid not in watchers:
                    stop_event = threading.Event()
                    t = threading.Thread(target=process_camera, args=(cam, stop_event))
                    t.daemon = True
                    t.start()
                    watchers[cid] = {
                        'stop_event': stop_event,
                        'config_sig': new_sig
                    }
            else:
                # Motion disabled for this camera
                if cid in watchers:
                    log.info(f"[{cam['name']}] Detection disabled.")
                    watchers[cid]['stop_event'].set()
                    del watchers[cid]
        
        # 4. Cleanup removed cameras
        current_ids = list(watchers.keys())
        for cid in current_ids:
            if cid not in active_ids:
                log.info(f"[Camera {cid}] Removed. Stopping thread.")
                watchers[cid]['stop_event'].set()
                del watchers[cid]

        time.sleep(10)

if __name__ == "__main__":
    main()