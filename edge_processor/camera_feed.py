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

API_BASE_DEFAULT = os.getenv("API_BASE", "http://localhost:8000")

# COCO Classes mapping for YOLO
CLASS_PERSON = 0
CLASS_CAR = 2
CLASS_MOTORCYCLE = 3
CLASS_BUS = 5
CLASS_TRUCK = 7
VEHICLE_CLASSES = {CLASS_CAR, CLASS_MOTORCYCLE, CLASS_BUS, CLASS_TRUCK}

# Tracking and Logic Constants
HISTORY_MAX_LEN = 15 # Frames to keep for velocity
FPS_ASSUMPTION = 10.0 # Approximate processing FPS for threshold calculations
SLOW_GAIT_THRESHOLD_PX_PER_SEC = 15.0 # Threshold for "Priority/Elderly" in pixels/sec
RISK_PREDICTION_SECONDS = 3.0
COLLISION_DISTANCE_THRESHOLD_PX = 100.0


class ThreadedCamera:
    """Robust RTSP handling using a dedicated thread and frame queue."""
    def __init__(self, source: str | int):
        self.source = source
        self.q = queue.Queue(maxsize=3)
        self.running = True
        self.cap = cv2.VideoCapture(source)
        self.thread = threading.Thread(target=self._reader, daemon=True)
        self.thread.start()

    def _reader(self):
        while self.running:
            if not self.cap.isOpened():
                time.sleep(2)
                self.cap = cv2.VideoCapture(self.source)
                continue
            
            ret, frame = self.cap.read()
            if not ret:
                self.cap.release()
                continue
            
            # Keep only the most recent frame to avoid lagging behind live feed
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
    """Calculates vx, vy, and magnitude (pixels/sec)."""
    if len(history) < 2:
        return 0.0, 0.0, 0.0
    
    x1, y1, t1 = history[0]
    x2, y2, t2 = history[-1]
    
    dt = t2 - t1
    if dt <= 0:
        return 0.0, 0.0, 0.0
        
    vx = (x2 - x1) / dt
    vy = (y2 - y1) / dt
    magnitude = math.hypot(vx, vy)
    return vx, vy, magnitude


def detect_v2p_risks(pedestrians: list, vehicles: list, api_base: str, intersection_id: str, sensor_id: str) -> None:
    """Predicts future collisions and triggers V2P haptic alerts."""
    for p in pedestrians:
        px, py = p['x'], p['y']
        pvx, pvy = p['vx'], p['vy']
        
        # Predict pedestrian position in RISK_PREDICTION_SECONDS
        future_px = px + pvx * RISK_PREDICTION_SECONDS
        future_py = py + pvy * RISK_PREDICTION_SECONDS
        
        for v in vehicles:
            vx, vy = v['x'], v['y']
            vvx, vvy = v['vx'], v['vy']
            
            # Predict vehicle position
            future_vx = vx + vvx * RISK_PREDICTION_SECONDS
            future_vy = vy + vvy * RISK_PREDICTION_SECONDS
            
            dist = math.hypot(future_px - future_vx, future_py - future_vy)
            
            # Simple collision threshold
            if dist < COLLISION_DISTANCE_THRESHOLD_PX and v['magnitude'] > 20.0:
                print(f"[V2P ALERT] Risk detected between Pedestrian {p['id']} and Vehicle {v['id']}")
                payload = {
                    "event_id": str(uuid.uuid4()),
                    "intersection_id": intersection_id,
                    "camera_id": sensor_id,
                    "latitude": 22.3000, # Mock lat
                    "longitude": 73.2000, # Mock lon
                    "danger_type": "pedestrian_collision_trajectory",
                    "severity": "high",
                    "detected_at": datetime.now(timezone.utc).isoformat()
                }
                try:
                    requests.post(f"{api_base}/api/v1/v2p/alert", json=payload, timeout=2)
                except Exception as e:
                    print(f"Failed to send V2P alert: {e}")


def status_code_from_exception(exc: requests.RequestException):
    response = getattr(exc, "response", None)
    return getattr(response, "status_code", None)


def send_payload(api_base: str, lane: str, vehicle_count: int, pedestrian_count: int, priority_pedestrians: int, sensor_id: str) -> None:
    url = f"{api_base}/ingest/traffic"
    payload = {
        "lane": lane,
        "vehicle_count": vehicle_count,
        "pedestrian_count": pedestrian_count,
        "priority_pedestrians": priority_pedestrians,
        "sensor_id": sensor_id,
    }
    max_retries = 3
    for attempt in range(max_retries):
        try:
            requests.post(url, json=payload, timeout=2).raise_for_status()
            return
        except requests.RequestException as exc:
            if attempt == max_retries - 1:
                print(json.dumps({"level": "error", "event": "traffic_post_failed", "error": str(exc)}))
            else:
                time.sleep(2 ** attempt)


def send_heartbeat(api_base: str, sensor_id: str) -> None:
    url = f"{api_base}/heartbeat/{sensor_id}"
    try:
        requests.post(url, timeout=2).raise_for_status()
    except requests.RequestException:
        pass


def run(source: str, api_base: str, lane: str, sensor_id: str, intersection_id: str, interval: float) -> None:
    # Initialize YOLOv8 deep learning model
    print("[INIT] Loading YOLOv8 Nano model...")
    model = YOLO("yolov8n.pt")
    
    # Handle int source for webcams
    capture_source = int(source) if source.isdigit() else source
    capture = ThreadedCamera(capture_source)
    
    print(json.dumps({"status": "started", "source": source, "lane": lane, "sensor_id": sensor_id}))

    track_history = defaultdict(list)
    last_send_time = time.time()

    try:
        while True:
            ok, frame = capture.read()
            if not ok or frame is None:
                continue

            # Run YOLOv8 Tracking (DeepSORT-like logic built-in)
            results = model.track(frame, persist=True, verbose=False)
            
            current_time = time.time()
            vehicle_count = 0
            pedestrian_count = 0
            priority_pedestrians = 0
            
            pedestrians_tracked = []
            vehicles_tracked = []

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
                    
                    obj_data = {
                        "id": track_id,
                        "x": float(x), "y": float(y),
                        "vx": vx, "vy": vy,
                        "magnitude": magnitude
                    }
                    
                    if cls == CLASS_PERSON:
                        pedestrian_count += 1
                        pedestrians_tracked.append(obj_data)
                        
                        # Pedestrian Demographic & Gait Classification
                        # If tracked long enough and moving very slow = Priority (Elderly/Handicapped)
                        if len(track_history[track_id]) >= HISTORY_MAX_LEN and magnitude < SLOW_GAIT_THRESHOLD_PX_PER_SEC:
                            priority_pedestrians += 1
                            
                    elif cls in VEHICLE_CLASSES:
                        vehicle_count += 1
                        vehicles_tracked.append(obj_data)
                        
            # Risk Detection (V2P Event)
            detect_v2p_risks(pedestrians_tracked, vehicles_tracked, api_base, intersection_id, sensor_id)

            # Send payload at the specified interval
            if current_time - last_send_time >= interval:
                send_payload(api_base, lane, vehicle_count, pedestrian_count, priority_pedestrians, sensor_id)
                send_heartbeat(api_base, sensor_id)
                last_send_time = current_time
                
                print(json.dumps({
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "lane": lane,
                    "vehicles": vehicle_count,
                    "pedestrians": pedestrian_count,
                    "priority_pedestrians": priority_pedestrians
                }))
                
            # Prevent history memory leak
            active_ids = track_ids if results[0].boxes and results[0].boxes.id is not None else []
            keys_to_delete = [k for k in track_history.keys() if k not in active_ids and (current_time - track_history[k][-1][2] > 5.0)]
            for k in keys_to_delete:
                del track_history[k]
                
    finally:
        capture.release()


def main() -> None:
    parser = argparse.ArgumentParser(description="Synapse City OS Edge Processor (YOLOv8)")
    parser.add_argument("--source", default="0", help="Camera source: webcam index (e.g. 0) or RTSP URL")
    parser.add_argument("--api-base", default=API_BASE_DEFAULT, help="Backend API base URL")
    parser.add_argument("--lane", default="North", help="Lane label")
    parser.add_argument("--sensor-id", default="edge-camera-1", help="Unique sensor ID")
    parser.add_argument("--intersection-id", default="INT-A", help="Intersection ID for V2P alerts")
    parser.add_argument("--interval", type=float, default=1.0, help="Seconds between sends")
    args = parser.parse_args()

    run(
        source=args.source,
        api_base=args.api_base,
        lane=args.lane,
        sensor_id=args.sensor_id,
        intersection_id=args.intersection_id,
        interval=args.interval,
    )


if __name__ == "__main__":
    main()
