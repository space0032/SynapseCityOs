from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone

import cv2
import requests


API_BASE_DEFAULT = "http://localhost:8000"


def parse_source(source: str):
    if source.isdigit():
        return int(source)
    return source


def mock_detect(frame) -> tuple[int, int]:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    avg = int(gray.mean())
    vehicle_count = max(0, min(15, (avg // 16) % 16))
    pedestrian_count = max(0, min(5, (avg // 32) % 6))
    return vehicle_count, pedestrian_count


def send_payload(api_base: str, lane: str, vehicle_count: int, pedestrian_count: int, sensor_id: str) -> None:
    url = f"{api_base}/ingest/traffic"
    payload = {
        "lane": lane,
        "vehicle_count": vehicle_count,
        "pedestrian_count": pedestrian_count,
        "sensor_id": sensor_id,
    }
    try:
        requests.post(url, json=payload, timeout=2).raise_for_status()
    except requests.RequestException as exc:
        print(
            json.dumps(
                {
                    "level": "error",
                    "event": "traffic_post_failed",
                    "url": url,
                    "lane": lane,
                    "sensor_id": sensor_id,
                    "error": str(exc),
                }
            )
        )


def send_heartbeat(api_base: str, sensor_id: str) -> None:
    url = f"{api_base}/heartbeat/{sensor_id}"
    try:
        requests.post(url, timeout=2).raise_for_status()
    except requests.RequestException as exc:
        print(
            json.dumps(
                {
                    "level": "error",
                    "event": "heartbeat_post_failed",
                    "url": url,
                    "sensor_id": sensor_id,
                    "error": str(exc),
                }
            )
        )


def run(source: str, api_base: str, lane: str, sensor_id: str, interval: float) -> None:
    capture = cv2.VideoCapture(parse_source(source))
    if not capture.isOpened():
        raise RuntimeError(f"Unable to open camera source: {source}")

    print(json.dumps({"status": "started", "source": source, "lane": lane, "sensor_id": sensor_id}))

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                time.sleep(0.2)
                continue

            vehicle_count, pedestrian_count = mock_detect(frame)
            send_payload(api_base, lane, vehicle_count, pedestrian_count, sensor_id)
            send_heartbeat(api_base, sensor_id)

            event = {
                "ts": datetime.now(timezone.utc).isoformat(),
                "lane": lane,
                "vehicle_count": vehicle_count,
                "pedestrian_count": pedestrian_count,
            }
            print(json.dumps(event))
            time.sleep(interval)
    finally:
        capture.release()


def main() -> None:
    parser = argparse.ArgumentParser(description="Synapse City OS edge camera processor")
    parser.add_argument("--source", default="0", help="Camera source: webcam index (e.g. 0) or RTSP URL")
    parser.add_argument("--api-base", default=API_BASE_DEFAULT, help="Backend API base URL")
    parser.add_argument("--lane", default="North", help="Lane label")
    parser.add_argument("--sensor-id", default="edge-camera-1", help="Unique sensor ID")
    parser.add_argument("--interval", type=float, default=1.0, help="Seconds between sends")
    args = parser.parse_args()

    run(
        source=args.source,
        api_base=args.api_base,
        lane=args.lane,
        sensor_id=args.sensor_id,
        interval=args.interval,
    )


if __name__ == "__main__":
    main()
