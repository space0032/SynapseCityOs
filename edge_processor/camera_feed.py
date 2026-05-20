from __future__ import annotations

import argparse
import json
import time
import threading
import queue
import math
import uuid
import os
from collections import defaultdict
from datetime import datetime, timezone

import cv2
import requests
import numpy as np
from ultralytics import YOLO
from flask import Flask, Response

latest_frames = {}
frame_lock = threading.Lock()
stop_flags = {}

app = Flask(__name__)

def generate_frames(sensor_id):
    global latest_frames, frame_lock
    last_counter = -1
    while True:
        with frame_lock:
            frame_data = latest_frames.get(sensor_id)
            
        if frame_data is None or frame_data['counter'] == last_counter:
            time.sleep(0.05) # Wait for a new frame
            continue
            
        last_counter = frame_data['counter']
        frame_bytes = frame_data['bytes']
            
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/video_feed/<sensor_id>')
def video_feed(sensor_id):
    return Response(generate_frames(sensor_id), mimetype='multipart/x-mixed-replace; boundary=frame')

API_BASE_DEFAULT = os.getenv("API_BASE", "http://localhost:8000")

CLASS_PERSON = 0
CLASS_CAR = 2
CLASS_MOTORCYCLE = 3
CLASS_BUS = 5
CLASS_TRUCK = 7
VEHICLE_CLASSES = {CLASS_CAR, CLASS_MOTORCYCLE, CLASS_BUS, CLASS_TRUCK}

HISTORY_MAX_LEN = 15
SLOW_GAIT_THRESHOLD_PX_PER_SEC = 15.0
RISK_PREDICTION_SECONDS = 3.0
COLLISION_DISTANCE_THRESHOLD_PX = 100.0


class ThreadedCamera:
    def __init__(self, source: str | int, sensor_id: str):
        self.source = source
        self.sensor_id = sensor_id
        self.q = queue.Queue(maxsize=3)
        self.running = True
        self.cap = cv2.VideoCapture(source)
        self.thread = threading.Thread(target=self._reader, daemon=True)
        self.thread.start()

    def _reader(self):
        while self.running and not stop_flags.get(self.sensor_id, False):
            if not self.cap.isOpened():
                time.sleep(2)
                self.cap = cv2.VideoCapture(self.source)
                continue
            
            ret, frame = self.cap.read()
            if not ret:
                self.cap.release()
                continue
            
            if self.q.full():
                try:
                    self.q.get_nowait()
                except queue.Empty:
                    pass
            self.q.put(frame)

    def read(self):
        try:
            return True, self.q.get(timeout=2.0)
        except queue.Empty:
            return False, None

    def release(self):
        self.running = False
        self.cap.release()


def calculate_velocity(history: list[tuple[float, float, float]]) -> tuple[float, float, float]:
    if len(history) < 2:
        return 0.0, 0.0, 0.0
    x1, y1, t1 = history[0]
    x2, y2, t2 = history[-1]
    dt = t2 - t1
    if dt <= 0:
        return 0.0, 0.0, 0.0
    vx = (x2 - x1) / dt
    vy = (y2 - y1) / dt
    return vx, vy, math.hypot(vx, vy)


def detect_v2p_risks(pedestrians: list, vehicles: list, api_base: str, intersection_id: str, sensor_id: str) -> None:
    for p in pedestrians:
        px, py = p['x'], p['y']
        pvx, pvy = p['vx'], p['vy']
        future_px = px + pvx * RISK_PREDICTION_SECONDS
        future_py = py + pvy * RISK_PREDICTION_SECONDS
        
        for v in vehicles:
            vx, vy = v['x'], v['y']
            vvx, vvy = v['vx'], v['vy']
            future_vx = vx + vvx * RISK_PREDICTION_SECONDS
            future_vy = vy + vvy * RISK_PREDICTION_SECONDS
            
            dist = math.hypot(future_px - future_vx, future_py - future_vy)
            if dist < COLLISION_DISTANCE_THRESHOLD_PX and v['magnitude'] > 20.0:
                payload = {
                    "event_id": str(uuid.uuid4()),
                    "intersection_id": intersection_id,
                    "camera_id": sensor_id,
                    "latitude": 22.3000,
                    "longitude": 73.2000,
                    "danger_type": "pedestrian_collision_trajectory",
                    "severity": "high",
                    "detected_at": datetime.now(timezone.utc).isoformat()
                }
                try:
                    requests.post(f"{api_base}/api/v1/v2p/alert", json=payload, timeout=2)
                except Exception:
                    pass


def send_payload(api_base: str, lane: str, vehicle_count: int, pedestrian_count: int, priority_pedestrians: int, sensor_id: str, vehicle_ids: list[int]) -> None:
    url = f"{api_base}/ingest/traffic"
    payload = {
        "lane": lane,
        "vehicle_count": vehicle_count,
        "pedestrian_count": pedestrian_count,
        "priority_pedestrians": priority_pedestrians,
        "sensor_id": sensor_id,
        "vehicle_ids": vehicle_ids,
    }
    for attempt in range(3):
        try:
            requests.post(url, json=payload, timeout=2).raise_for_status()
            return
        except requests.RequestException:
            time.sleep(2 ** attempt)


def send_heartbeat(api_base: str, sensor_id: str) -> None:
    url = f"{api_base}/heartbeat/{sensor_id}"
    try:
        requests.post(url, timeout=2)
    except requests.RequestException:
        pass


def process_camera(source: str, api_base: str, lane: str, sensor_id: str, intersection_id: str, interval: float) -> None:
    print(f"[INIT] Loading YOLOv8 Nano model for {sensor_id}...")
    model = YOLO("yolov8n.pt")
    capture_source = int(source) if source.isdigit() else source
    capture = ThreadedCamera(capture_source, sensor_id)
    
    print(json.dumps({"status": "started", "source": source, "lane": lane, "sensor_id": sensor_id}))
    track_history = defaultdict(list)
    last_send_time = time.time()
    frame_counter = 0

    try:
        while not stop_flags.get(sensor_id, False):
            ok, frame = capture.read()
            if not ok or frame is None:
                continue

            # Optimize YOLO by reducing imgsz for faster processing
            results = model.track(frame, persist=True, verbose=False, imgsz=480)
            annotated_frame = results[0].plot()
            
            # Encode frame here to save Flask thread CPU
            ret, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ret:
                frame_counter += 1
                global latest_frames
                with frame_lock:
                    latest_frames[sensor_id] = {'bytes': buffer.tobytes(), 'counter': frame_counter}

            current_time = time.time()
            vehicle_count, pedestrian_count, priority_pedestrians = 0, 0, 0
            pedestrians_tracked, vehicles_tracked = [], []

            if results[0].boxes is not None and results[0].boxes.id is not None:
                boxes = results[0].boxes.xywh.cpu()
                track_ids = results[0].boxes.id.int().cpu().tolist()
                classes = results[0].boxes.cls.int().cpu().tolist()
                
                for box, track_id, cls in zip(boxes, track_ids, classes):
                    x, y, w, h = box
                    track_history[track_id].append((float(x), float(y), current_time))
                    if len(track_history[track_id]) > HISTORY_MAX_LEN:
                        track_history[track_id].pop(0)
                        
                    vx, vy, magnitude = calculate_velocity(track_history[track_id])
                    obj_data = {"id": track_id, "x": float(x), "y": float(y), "vx": vx, "vy": vy, "magnitude": magnitude}
                    
                    if cls == CLASS_PERSON:
                        pedestrian_count += 1
                        pedestrians_tracked.append(obj_data)
                        if len(track_history[track_id]) >= HISTORY_MAX_LEN and magnitude < SLOW_GAIT_THRESHOLD_PX_PER_SEC:
                            priority_pedestrians += 1
                    elif cls in VEHICLE_CLASSES:
                        vehicle_count += 1
                        vehicles_tracked.append(obj_data)
                        
            detect_v2p_risks(pedestrians_tracked, vehicles_tracked, api_base, intersection_id, sensor_id)

            if current_time - last_send_time >= interval:
                current_vehicle_ids = [v['id'] for v in vehicles_tracked]
                send_payload(api_base, lane, vehicle_count, pedestrian_count, priority_pedestrians, sensor_id, current_vehicle_ids)
                send_heartbeat(api_base, sensor_id)
                last_send_time = current_time
                
            active_ids = track_ids if results[0].boxes and results[0].boxes.id is not None else []
            keys_to_delete = [k for k in track_history.keys() if k not in active_ids and (current_time - track_history[k][-1][2] > 5.0)]
            for k in keys_to_delete:
                del track_history[k]
                
    finally:
        capture.release()
        print(f"[STOPPED] Camera {sensor_id} stopped.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Synapse City OS Edge Processor Manager")
    parser.add_argument("--api-base", default=API_BASE_DEFAULT, help="Backend API base URL")
    parser.add_argument("--port", type=int, default=5000, help="Port to serve the MJPEG live previews")
    args = parser.parse_args()

    print(f"[INIT] Starting live preview server on port {args.port}...")
    flask_thread = threading.Thread(target=lambda: app.run(host='0.0.0.0', port=args.port, debug=False, use_reloader=False), daemon=True)
    flask_thread.start()

    active_cameras = {}

    while True:
        try:
            res = requests.get(f"{args.api_base}/api/v1/admin/cameras", timeout=5)
            if res.ok:
                cameras = res.json().get("items", [])
                current_ids = {c["sensor_id"] for c in cameras}
                
                # Start new cameras
                for c in cameras:
                    sensor_id = c["sensor_id"]
                    if sensor_id not in active_cameras:
                        print(f"[MANAGER] Starting processing for new camera: {sensor_id}")
                        stop_flags[sensor_id] = False
                        t = threading.Thread(
                            target=process_camera,
                            args=(c["source"], args.api_base, c["lane"], sensor_id, "INT-A", 1.0),
                            daemon=True
                        )
                        active_cameras[sensor_id] = t
                        t.start()
                
                # Stop removed cameras
                for sid in list(active_cameras.keys()):
                    if sid not in current_ids:
                        print(f"[MANAGER] Stopping camera: {sid}")
                        stop_flags[sid] = True
                        del active_cameras[sid]
                        
        except Exception as e:
            print(f"[MANAGER] Error fetching cameras: {e}")
            
        time.sleep(5)


if __name__ == "__main__":
    main()

