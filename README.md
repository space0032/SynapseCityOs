# Synapse City OS (Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5)

This repository contains:

- **Phase 1 MVP** for adaptive traffic, sensor heartbeat failover, and road-integrity anomaly ingestion.
- **Phase 2 Fleet & Public Transit Integration** with a Java Spring Boot fleet-service.
- **Phase 4 City Admin Dashboard & API Gateway** with a frontend MVP and unified BFF routes.

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

## Architecture (Phase 3)

- **Emergency Priority Service (God Mode)** (`backend/app/main.py`)
  - `POST /api/v1/emergency/priority-ping` ingests secure emergency GPS pings (`x-emergency-token` header).
  - Triggers immediate traffic override events with `ALL_RED` cross-traffic and `GREEN_WAVE` for emergency route intersections.
  - `GET /api/v1/traffic/overrides/{intersection_id}` exposes active override state.
- **Pollution & Air Quality Monitor**
  - `POST /api/v1/pollution/ingest` ingests AQI/PM2.5/NO2 sensor data by zone/intersection.
  - `GET /api/v1/pollution/high` lists zones currently flagged as high pollution for diversion decisions.
- **Smart Parking API**
  - `POST /api/v1/parking/ingest` ingests parking slot occupancy updates.
  - `GET /api/v1/commuter/parking` returns nearest available slots for commuter apps.
- **V2P Haptic Alerts**
  - `POST /api/v1/v2p/alert` ingests pedestrian-in-danger events from edge cameras.
  - `GET /api/v1/v2p/alerts` provides a low-latency alert feed for pedestrian apps and vehicle dashboards.

## Architecture (Phase 4)

- **API Gateway / BFF** (`api-gateway/app/main.py`)
  - Unified proxy routes so frontend/mobile clients do not call each microservice directly.
  - Admin aggregate routes:
    - `GET /api/admin/live-traffic`
    - `GET /api/admin/road-health`
    - `GET /api/admin/active-alerts`
  - Public commuter aggregate route:
    - `GET /api/public/commuter?route_id=...&latitude=...&longitude=...`
- **City Admin Dashboard (MVP)** (`admin-dashboard/index.html`)
  - Browser dashboard panels for:
    - live intersection signal/vehicle status
    - pothole reports with coordinates
    - active emergency and high-pollution alerts

## Architecture (Phase 5)

- **Commuter Mobile App (Citizen Portal)** (`commuter-app`)
  - React Native + Expo cross-platform app scaffold.
  - Live Transit Dashboard via API Gateway `GET /api/public/commuter`.
  - Smart Parking Finder + Air Quality routing suggestions from the same commuter aggregate response.
  - Mock V2P safety listener using optional WebSocket input plus background simulation for danger events.

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
```

### 5) Run Fleet Service locally (without Docker)

```bash
cd fleet-service
mvn spring-boot:run
```

### 6) Run API Gateway locally

```bash
cd api-gateway
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 9000
```

### 7) Open Admin Dashboard

- With Docker Compose: http://localhost:3000
- Dashboard reads data from API Gateway at http://localhost:9000

### 8) Run Commuter Mobile App (Phase 5)

```bash
cd commuter-app
npm install
npx expo start
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
- `POST /api/v1/emergency/priority-ping` – secure emergency vehicle GPS ping with God Mode override trigger
- `GET /api/v1/traffic/overrides/{intersection_id}` – read current emergency override state for an intersection
- `POST /api/v1/pollution/ingest` – ingest AQI/PM2.5/NO2 readings by zone
- `GET /api/v1/pollution/high` – list high-pollution zones for traffic diversion
- `POST /api/v1/parking/ingest` – ingest parking occupancy updates from IoT sensors
- `GET /api/v1/commuter/parking` – return nearest available parking slots by commuter location
- `POST /api/v1/v2p/alert` – ingest and broadcast pedestrian danger alerts
- `GET /api/v1/v2p/alerts` – list latest V2P broadcast alerts
- `GET /api/v1/admin/live-traffic` – list live intersection state and vehicle counts
- `GET /api/v1/traffic/overrides` – list all currently active emergency overrides
- `GET /api/admin/live-traffic` – admin dashboard traffic panel data from API Gateway
- `GET /api/admin/road-health` – admin dashboard pothole panel data from API Gateway
- `GET /api/admin/active-alerts` – admin dashboard alerts panel data from API Gateway
- `GET /api/public/commuter` – unified commuter API route (bus tracking + parking + air quality)

## Tests

```bash
PYTHONPATH=backend pytest backend/tests -q
```

```bash
PYTHONPATH=api-gateway pytest api-gateway/tests -q
```

```bash
cd fleet-service
mvn test
```
