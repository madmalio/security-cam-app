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

# OBJECT MOTION: How many pixels INSIDE the box must move to be "Real"
OBJECT_MOTION_THRESHOLD = 50 

# GLOBAL MOTION: How many pixels must move on SCREEN to wake up the AI
# 1000 is roughly a small cat moving. Prevents AI from running on empty frames.
GLOBAL_MOTION_THRESHOLD = 1000 

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

    target_classes = [0] 
    if camera.get('ai_classes'):
        try:
            target_classes = [int(x) for x in camera['ai_classes'].split(',') if x.strip()]
        except: pass
    
    log.info(f"[{cam_name}] Watching for classes: {target_classes}")

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
            # Calculate total motion on screen
            global_motion_score = np.count_nonzero(motion_mask)
        
        prev_gray = gray

        # --- OPTIMIZATION: GLOBAL GATING ---
        # If barely anything moved AND we aren't currently recording, 
        # skip the heavy AI inference entirely.
        if global_motion_score < GLOBAL_MOTION_THRESHOLD and not is_recording:
             continue 
        # -----------------------------------

        # Run AI
        results = model(small_frame, classes=target_classes, verbose=False, conf=CONFIDENCE, imgsz=IMGSZ)
        
        valid_detection_label = ""
        
        for result in results:
            for box in result.boxes:
                cls_id = int(box.cls[0])
                if cls_id in target_classes:
                    label = model.names[cls_id]
                    
                    # Object-Specific Motion Check
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
                        # First frame of connection, assume valid to be safe
                        valid_detection_label = label
                        break

            if valid_detection_label: break

        # Trigger Logic
        if valid_detection_label:
            cooldown = 10 
            if not is_recording:
                log.info(f"[{cam_name}] MOVING {valid_detection_label.upper()}! Recording started.")
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

def main():
    global MODEL_NAME
    log.info("--- AI Detector Starting (Global Gating Active) ---")
    
    if os.path.exists(MODEL_NAME):
        shutil.rmtree(MODEL_NAME)

    try:
        model = YOLO(PT_NAME)
        model.export(format="openvino", imgsz=IMGSZ)
    except Exception:
        MODEL_NAME = PT_NAME

    watchers = {}
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
                    watchers[cid].set()
                    del watchers[cid]
        
        for cid in list(watchers.keys()):
            if cid not in active_ids:
                watchers[cid].set()
                del watchers[cid]

        time.sleep(10)

if __name__ == "__main__":
    main()