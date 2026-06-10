<div align="center">

# 🧠 Synapse City OS

**An intelligent, event-driven city operating system for adaptive traffic management, fleet orchestration, emergency response, environmental monitoring, and citizen mobility.**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.116-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.3-6DB33F?logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Expo](https://img.shields.io/badge/Expo-54-000020?logo=expo&logoColor=white)](https://expo.dev)
[![Docker](https://img.shields.io/badge/Docker_Compose-ready-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

*Real-time traffic signal actuation · Fleet & transit tracking · Emergency "God Mode" overrides · Air quality monitoring · Smart parking · V2P pedestrian safety · AI-powered congestion forecasting*

</div>

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Services & Tech Stack](#services--tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Full Stack (Docker Compose)](#full-stack-docker-compose)
  - [Running Services Individually](#running-services-individually)
- [Service Port Map](#service-port-map)
- [API Reference](#api-reference)
  - [Traffic & Signals](#traffic--signals)
  - [Sensor Heartbeat & Failover](#sensor-heartbeat--failover)
  - [Road Integrity (Pothole Detection)](#road-integrity-pothole-detection)
  - [Fleet & Public Transit](#fleet--public-transit)
  - [Emergency Priority (God Mode)](#emergency-priority-god-mode)
  - [Pollution & Air Quality](#pollution--air-quality)
  - [Smart Parking](#smart-parking)
  - [V2P Pedestrian Safety](#v2p-pedestrian-safety)
  - [Predictive Traffic Intelligence](#predictive-traffic-intelligence)
  - [Admin & Camera Management](#admin--camera-management)
  - [API Gateway Aggregate Routes](#api-gateway-aggregate-routes)
- [WebSocket Streams](#websocket-streams)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)

---

## Overview

Synapse City OS is a microservices platform that transforms a city's transportation infrastructure into an intelligent, self-optimizing network. It ingests real-time data from edge cameras, IoT sensors, fleet GPS units, and environmental monitors — then applies dynamic signal control, predictive analytics, and emergency coordination to keep a city moving safely and efficiently.

### Key Capabilities

| Domain | What It Does |
|---|---|
| **Adaptive Traffic Signals** | Dynamic green-time actuation with gap-out logic, min/max bounds, and priority pedestrian extensions |
| **Sensor Failover** | Heartbeat monitoring with automatic fallback to time-of-day historical signal timers |
| **Fleet Management** | Real-time bus telemetry, schedule adherence checks, and transit-signal priority requests |
| **Emergency Override** | Token-secured "God Mode" — ALL_RED cross-traffic + GREEN_WAVE corridor for emergency vehicles |
| **Road Integrity** | Accelerometer-based pothole detection from bus vibration data (z-accel ≥ 2.5 g threshold) |
| **Air Quality** | AQI / PM2.5 / NO₂ ingestion with automatic high-pollution zone flagging for traffic diversion |
| **Smart Parking** | IoT-based slot occupancy tracking with nearest-slot queries and elderly-priority sorting |
| **V2P Safety** | Vehicle-to-Pedestrian danger alerts broadcast via REST + WebSocket to pedestrian apps and dashboards |
| **AI Forecasting** | scikit-learn model trained on InfluxDB time-series data to predict congestion 15–30 min ahead |
| **Admin Dashboard** | React + Vite web console with live signal status, pothole maps, fleet tracking, and alert panels |
| **Commuter Portal** | Citizen-facing React web app for transit, parking, and air quality information |
| **Commuter Mobile App** | React Native + Expo cross-platform app for on-the-go transit, parking, and V2P safety alerts |

---

## Architecture

```mermaid
graph TB
    subgraph Edge["Edge Layer"]
        CAM["🎥 Edge AI Camera<br/>(OpenCV + Python)"]
        IOT["📡 IoT Sensors<br/>(Parking, AQI, Vibration)"]
    end

    subgraph Core["Core Processing"]
        BE["⚡ Backend<br/>(FastAPI)"]
        FLEET["🚌 Fleet Service<br/>(Spring Boot)"]
        PRED["🤖 Prediction Engine<br/>(FastAPI + scikit-learn)"]
        GW["🔀 API Gateway / BFF<br/>(FastAPI)"]
    end

    subgraph Data["Data Layer"]
        PG[("🐘 PostgreSQL")]
        REDIS[("⚡ Redis")]
        INFLUX[("📈 InfluxDB")]
        MQTT["🔗 Mosquitto<br/>(MQTT)"]
    end

    subgraph Frontend["Presentation Layer"]
        ADMIN["🖥️ Admin Dashboard<br/>(React + Vite)"]
        PORTAL["🌐 Commuter Portal<br/>(React + Vite)"]
        MOBILE["📱 Commuter App<br/>(React Native + Expo)"]
    end

    CAM -->|Traffic Counts + Heartbeat| BE
    IOT -->|Parking, AQI, Accel| BE
    BE <--> PG
    BE <--> REDIS
    FLEET <--> PG
    PRED <--> INFLUX
    PRED -->|Predictive Alerts| BE
    GW --> BE
    GW --> FLEET
    GW --> PRED
    ADMIN --> GW
    PORTAL --> GW
    MOBILE --> GW
```

---

## Services & Tech Stack

| Service | Language / Framework | Description |
|---|---|---|
| **backend** | Python · FastAPI · SQLAlchemy · asyncpg | Core processing — traffic signals, heartbeat, road integrity, emergency, pollution, parking, V2P |
| **fleet-service** | Java 17 · Spring Boot 3.3 · JPA · PostgreSQL | Bus telemetry ingestion, schedule monitoring, transit-signal priority |
| **prediction-engine** | Python · FastAPI · scikit-learn · InfluxDB | ML-based traffic forecasting and proactive congestion alerting |
| **api-gateway** | Python · FastAPI | Unified BFF / proxy layer for all frontend clients |
| **edge_processor** | Python · OpenCV | Webcam / RTSP feed processing with mock vehicle & pedestrian detection |
| **admin-dashboard** | TypeScript · React 19 · Vite · Recharts · Leaflet | City operator web console |
| **commuter-portal** | TypeScript · React 19 · Vite · Leaflet | Citizen-facing web portal for transit & city services |
| **commuter-app** | TypeScript · React Native · Expo 54 | Cross-platform mobile app |

**Infrastructure:** PostgreSQL 16 · Redis 7 · InfluxDB 2.7 · Eclipse Mosquitto 2 · pgAdmin 4 · Docker Compose

---

## Getting Started

### Prerequisites

- **Docker** & **Docker Compose** (recommended for full stack)
- **Python 3.11+** (for running services locally)
- **Java 17+** & **Maven** (for fleet-service)
- **Node.js 18+** & **npm** (for frontend apps)

### Full Stack (Docker Compose)

The fastest way to run everything:

```bash
docker compose up --build
```

This starts all services, databases, and the admin dashboard. See the [Service Port Map](#service-port-map) for URLs.

### Running Services Individually

<details>
<summary><strong>Backend (FastAPI)</strong></summary>

```bash
pip install -r requirements.txt
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```
</details>

<details>
<summary><strong>Fleet Service (Spring Boot)</strong></summary>

```bash
cd fleet-service
mvn spring-boot:run
```
</details>

<details>
<summary><strong>Prediction Engine</strong></summary>

```bash
cd prediction-engine
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 9100
```
</details>

<details>
<summary><strong>API Gateway</strong></summary>

```bash
cd api-gateway
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 9000
```
</details>

<details>
<summary><strong>Edge Camera Processor</strong></summary>

Webcam feed:
```bash
python edge_processor/camera_feed.py --source 0 --lane North --api-base http://localhost:8000
```

RTSP camera:
```bash
python edge_processor/camera_feed.py --source "rtsp://user:pass@camera-ip:554/stream" --lane North --api-base http://localhost:8000
```
</details>

<details>
<summary><strong>Admin Dashboard</strong></summary>

```bash
cd admin-dashboard
npm install
npm run dev
```
</details>

<details>
<summary><strong>Commuter Portal</strong></summary>

```bash
cd commuter-portal
npm install
npm run dev
```
</details>

<details>
<summary><strong>Commuter Mobile App (Expo)</strong></summary>

```bash
cd commuter-app
npm install
npx expo start
```
</details>

---

## Service Port Map

| Service | Port | URL |
|---|---|---|
| Backend (FastAPI) | `8000` | http://localhost:8000 |
| Fleet Service (Spring Boot) | `8080` | http://localhost:8080 |
| API Gateway / BFF | `9000` | http://localhost:9000 |
| Prediction Engine | `9100` | http://localhost:9100 |
| Admin Dashboard | `3000` | http://localhost:3000 |
| Edge Processor | `5000` | http://localhost:5000 |
| PostgreSQL | `5432` | — |
| pgAdmin | `5050` | http://localhost:5050 |
| Redis | `6379` | — |
| InfluxDB | `8086` | http://localhost:8086 |
| Mosquitto (MQTT) | `1883` / `9001` | — |

---

## API Reference

### Traffic & Signals

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/ingest/traffic` | Ingest lane traffic counts (vehicle, pedestrian, priority pedestrians) |
| `POST` | `/traffic/decision` | Get dynamic / fallback / god-mode signal decision for a lane |

### Sensor Heartbeat & Failover

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/heartbeat/{sensor_id}` | Send edge sensor heartbeat (every 1 s) |
| `GET` | `/heartbeat/{sensor_id}` | Check sensor health status and fallback flag |

### Road Integrity (Pothole Detection)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/ingest/road-integrity` | Ingest bus GPS + z-axis accelerometer sample |
| `GET` | `/ingest/road-integrity/anomalies` | List all detected road anomalies |

### Fleet & Public Transit

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/fleet/telemetry` | Ingest bus telemetry and trigger priority requests for late buses |
| `GET` | `/api/v1/commuter/buses/{route_id}` | Real-time bus locations + occupancy status for a route |

### Emergency Priority (God Mode)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/emergency/priority-ping` | Secure emergency GPS ping → ALL_RED + GREEN_WAVE override |
| `GET` | `/api/v1/traffic/overrides/{intersection_id}` | Current override state for an intersection |
| `GET` | `/api/v1/traffic/overrides` | List all active emergency overrides |

> **Auth:** Requires `x-emergency-token` header.

### Pollution & Air Quality

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/pollution/ingest` | Ingest AQI / PM2.5 / NO₂ sensor readings by zone |
| `GET` | `/api/v1/pollution/high` | List zones flagged as high-pollution |
| `GET` | `/api/v1/pollution/all` | List all pollution zones |

### Smart Parking

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/parking/ingest` | Ingest parking slot occupancy updates |
| `GET` | `/api/v1/commuter/parking` | Nearest available slots (supports `is_elderly` priority sorting) |

### V2P Pedestrian Safety

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/v2p/alert` | Ingest pedestrian-in-danger event from edge camera |
| `GET` | `/api/v1/v2p/alerts` | List latest V2P broadcast alerts |

### Predictive Traffic Intelligence

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/prediction/mock-seed` | Seed mock historical time-series into InfluxDB |
| `POST` | `/api/v1/prediction/train` | Retrain the forecasting model |
| `POST` | `/api/v1/prediction/forecast` | Predict congestion 15–30 min ahead and trigger proactive alerts |
| `POST` | `/api/v1/traffic/predictive-alert` | Ingest high-congestion prediction for proactive signal timing |

> **Auth:** `/predictive-alert` requires `x-prediction-token` header.

**Example — Seed + Forecast:**

```bash
# Seed 288 rows of mock traffic history
curl -X POST http://localhost:9100/api/v1/prediction/mock-seed \
  -H "Content-Type: application/json" \
  -d '{"rows": 288}'

# Run a forecast
curl -X POST http://localhost:9100/api/v1/prediction/forecast \
  -H "Content-Type: application/json" \
  -d '{
    "lane": "North",
    "intersection_id": "INT-1",
    "current_vehicle_count": 26,
    "bus_delay_minutes": 8,
    "lead_minutes": 30
  }'
```

### Admin & Camera Management

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/admin/live-traffic` | Live intersection signal state and vehicle counts |
| `GET` | `/api/v1/admin/cameras` | List registered cameras |
| `POST` | `/api/v1/admin/cameras` | Register a new camera |
| `DELETE` | `/api/v1/admin/cameras/{sensor_id}` | Delete a camera |
| `POST` | `/api/v1/admin/cameras/upload` | Upload a camera video file |
| `GET` | `/api/v1/admin/traffic/export` | Export vehicle pass data as CSV |

### API Gateway Aggregate Routes

These routes are served by the API Gateway (`port 9000`) and aggregate data from multiple backend services:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/live-traffic` | Admin — live traffic panel data |
| `GET` | `/api/admin/road-health` | Admin — pothole / road health panel |
| `GET` | `/api/admin/active-alerts` | Admin — emergency + pollution alerts |
| `GET` | `/api/public/commuter` | Commuter — unified bus + parking + AQI data |

---

## WebSocket Streams

| Endpoint | Description |
|---|---|
| `ws://localhost:8000/api/v1/admin/live-traffic/ws` | Real-time traffic state updates pushed on every ingestion |
| `ws://localhost:8000/api/v1/v2p/alerts/ws` | Real-time V2P pedestrian danger alerts |

---

## Testing

```bash
# Backend unit tests
PYTHONPATH=backend pytest backend/tests -q

# API Gateway tests
PYTHONPATH=api-gateway pytest api-gateway/tests -q

# Fleet Service tests
cd fleet-service && mvn test
```

---

## Project Structure

```
SynapseCityOs/
├── backend/                  # Core processing service (FastAPI)
│   ├── app/
│   │   ├── main.py           #   All API endpoints & traffic logic
│   │   └── db.py             #   SQLAlchemy async database layer
│   ├── tests/
│   └── Dockerfile
├── fleet-service/            # Fleet & transit service (Spring Boot)
│   ├── src/
│   ├── pom.xml
│   └── Dockerfile
├── prediction-engine/        # AI forecasting service (FastAPI + scikit-learn)
│   ├── app/
│   ├── requirements.txt
│   └── Dockerfile
├── api-gateway/              # BFF / proxy layer (FastAPI)
│   ├── app/
│   ├── tests/
│   └── Dockerfile
├── edge_processor/           # Edge AI camera feed processor (OpenCV)
│   ├── camera_feed.py
│   └── Dockerfile
├── admin-dashboard/          # City admin web console (React + Vite)
│   ├── src/
│   │   ├── components/       #   Dashboard, Alerts, Fleet, Map, Login
│   │   └── context/
│   └── Dockerfile
├── commuter-portal/          # Citizen web portal (React + Vite)
│   └── src/
├── commuter-app/             # Citizen mobile app (React Native + Expo)
│   ├── App.tsx
│   └── app.json
├── data/                     # Shared data / uploads volume
├── postman/                  # Postman collections & environments
├── docker-compose.yml        # Full stack orchestration
├── requirements.txt          # Root Python dependencies
└── README.md
```

---

## Environment Variables

Key environment variables configured in `docker-compose.yml`:

| Variable | Default | Used By |
|---|---|---|
| `EMERGENCY_API_TOKEN` | `synapse-emergency-token` | backend |
| `PREDICTION_ENGINE_TOKEN` | `synapse-prediction-token` | backend, prediction-engine |
| `DATABASE_URL` | `postgresql+asyncpg://synapse:synapse@postgres:5432/synapsecity` | backend |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://postgres:5432/synapsecity` | fleet-service |
| `INFLUXDB_URL` | `http://influxdb:8086` | prediction-engine |
| `INFLUX_ORG` | `synapse-city` | prediction-engine |
| `INFLUX_BUCKET` | `traffic_analytics` | prediction-engine |
| `INFLUX_TOKEN` | `synapse-influx-token` | prediction-engine |
| `POLLUTION_AQI_THRESHOLD` | `150` | backend |
| `POLLUTION_PM25_THRESHOLD` | `55` | backend |
| `POLLUTION_NO2_THRESHOLD` | `100` | backend |
| `MODEL_UPDATE_INTERVAL_SECONDS` | `300` | prediction-engine |
| `HIGH_CONGESTION_THRESHOLD` | `30` | prediction-engine |
| `BACKEND_BASE_URL` | `http://backend:8000` | api-gateway, prediction-engine |
| `FLEET_BASE_URL` | `http://fleet-service:8080` | api-gateway |
| `PREDICTION_BASE_URL` | `http://prediction-engine:9100` | api-gateway, fleet-service |

---

<div align="center">

**Built with ❤️ for smarter cities**

</div>
