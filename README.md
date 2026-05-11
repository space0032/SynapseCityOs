# Synapse City OS (Phase 1 + Phase 2)

This repository contains:

- **Phase 1 MVP** for adaptive traffic, sensor heartbeat failover, and road-integrity anomaly ingestion.
- **Phase 2 Fleet & Public Transit Integration** with a Java Spring Boot fleet-service.

## Architecture (Phase 1)

- **Edge AI Camera Processor** (`edge_processor/camera_feed.py`)
  - Reads webcam (`0`) or RTSP feed via OpenCV (`cv2`).
  - Runs a mock detection pipeline to produce `vehicle_count` and `pedestrian_count`.
  - Sends traffic JSON payloads and 1s heartbeats to the backend via HTTP.

- **Processing Layer Backend** (`backend/app/main.py`)
  - **Traffic Light Manager** with dynamic actuation:
    - `min_green = 5s`
    - `max_green = 120s`
    - `gap_out` when queue is `0` and no new vehicles for 3s (after min green).
  - **Heartbeat & Fallback API**:
    - Edge sensor heartbeats every second.
    - If 3+ seconds are missed, sensor is marked as failure.
    - Decision API switches to a time-of-day historical fallback timer.
  - **Road Integrity (Pothole API)**:
    - Ingests bus GPS + `z_accel`.
    - Flags pothole anomalies when `|z_accel| >= 2.5`.

- **Infrastructure**
  - `docker-compose.yml` starts:
    - backend (FastAPI)
    - fleet-service (Spring Boot)
    - Eclipse Mosquitto (MQTT broker)
    - Redis (cache/state option)
    - PostgreSQL (future persistence)

## Architecture (Phase 2)

- **Fleet Tracking Service** (`fleet-service`)
  - `POST /api/v1/fleet/telemetry` ingests bus telemetry (`bus_id`, `gps_coordinates` lat/lon, `speed`, `passenger_count`, `route_id`).
  - Includes schedule monitoring to determine whether a bus is behind schedule based on route/location distance checks.
  - Emits a simulated traffic-light **priority request** event when a late bus is approaching a configured intersection.
- **Commuter API**
  - `GET /api/v1/commuter/buses/{route_id}` returns real-time buses for a route with location and `occupancy_status` (`EMPTY`, `MODERATE`, `FULL`).

## Quick Start

### 1) Install dependencies

```bash
pip install -r requirements.txt
```

### 2) Run backend locally

```bash
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3) Run edge camera processor

Webcam:

```bash
python edge_processor/camera_feed.py --source 0 --lane North --api-base http://localhost:8000
```

RTSP camera:

```bash
python edge_processor/camera_feed.py --source "rtsp://user:pass@camera-ip:554/stream" --lane North --api-base http://localhost:8000
```

### 4) Start full local stack with Docker Compose

```bash
docker compose up --build

### 5) Run Fleet Service locally (without Docker)

```bash
cd fleet-service
mvn spring-boot:run
```
```

## Core API Endpoints

- `POST /ingest/traffic` – ingest lane traffic counts
- `POST /traffic/decision` – get dynamic/fallback signal decision
- `POST /heartbeat/{sensor_id}` – send sensor heartbeat
- `GET /heartbeat/{sensor_id}` – sensor status and fallback flag
- `POST /ingest/road-integrity` – ingest bus vibration + GPS sample
- `GET /ingest/road-integrity/anomalies` – list detected anomalies
- `POST /api/v1/fleet/telemetry` – ingest fleet telemetry and trigger priority requests for late buses near intersections
- `GET /api/v1/commuter/buses/{route_id}` – commuter route view with bus locations + occupancy status

## Tests

```bash
PYTHONPATH=backend pytest backend/tests -q

```bash
cd fleet-service
mvn test
```
```
