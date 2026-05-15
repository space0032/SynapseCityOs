from __future__ import annotations

import asyncio
import os
import random
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor

try:
    from influxdb_client import InfluxDBClient, Point
    from influxdb_client.client.write_api import SYNCHRONOUS
except Exception:  # pragma: no cover
    InfluxDBClient = None
    Point = None
    SYNCHRONOUS = None


BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://backend:8000")
PREDICTION_TOKEN = os.getenv("PREDICTION_ENGINE_TOKEN", "synapse-prediction-token")
MODEL_UPDATE_INTERVAL_SECONDS = int(os.getenv("MODEL_UPDATE_INTERVAL_SECONDS", "300"))
HIGH_CONGESTION_THRESHOLD = int(os.getenv("HIGH_CONGESTION_THRESHOLD", "30"))
MAX_RECOMMENDED_GREEN_S = 180
BASE_RECOMMENDED_GREEN_S = 120
MIN_ADDITIONAL_GREEN_S = 15
PEAK_HOURS = {7, 8, 9, 17, 18, 19}

INFLUXDB_URL = os.getenv("INFLUXDB_URL", os.getenv("INFLUX_URL", "http://influxdb:8086"))
INFLUX_ORG = os.getenv("INFLUX_ORG", "synapse-city")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "traffic_analytics")
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN", "synapse-influx-token")

MODEL: Optional[LinearRegression] = None
CROWD_MODEL: Optional[RandomForestRegressor] = None
MODEL_VERSION = 0
MODEL_TRAINED_AT: Optional[str] = None
LAST_TRAINING_ROWS = 0


class PredictionRequest(BaseModel):
    lane: str
    intersection_id: Optional[str] = None
    current_vehicle_count: int = Field(ge=0)
    bus_delay_minutes: float = Field(default=0.0, ge=0)
    lead_minutes: int = Field(default=30, ge=15, le=30)


class CrowdPredictionRequest(BaseModel):
    route_id: str
    hour: int
    day: int


class TrainingRequest(BaseModel):
    rows: int = Field(default=288, ge=48, le=3000)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _feature_row(hour: int, vehicle_count: int, bus_delay_minutes: float) -> List[float]:
    return [float(hour), float(vehicle_count), float(bus_delay_minutes)]


def _route_id_to_int(route_id: str) -> int:
    return sum(ord(c) for c in route_id)


def generate_mock_historical_data(rows: int = 288) -> List[dict]:
    records: List[dict] = []
    for i in range(rows):
        hour = (i // 12) % 24
        is_peak = hour in PEAK_HOURS
        base = random.randint(8, 20)
        vehicle_count = base + (random.randint(10, 24) if is_peak else random.randint(0, 8))
        bus_delay_minutes = round(random.uniform(4, 12) if is_peak else random.uniform(0, 6), 2)
        future_vehicle_count = int(vehicle_count + bus_delay_minutes + (6 if is_peak else 1))
        records.append(
            {
                "hour": hour,
                "vehicle_count": vehicle_count,
                "bus_delay_minutes": bus_delay_minutes,
                "future_vehicle_count": future_vehicle_count,
            }
        )
    return records


def generate_mock_crowd_data(rows: int = 500) -> tuple[List[List[float]], List[float]]:
    features = []
    targets = []
    for _ in range(rows):
        route_int = random.randint(100, 200)
        hour = random.randint(0, 23)
        day = random.randint(1, 7)
        is_peak = hour in PEAK_HOURS
        is_weekend = day >= 6
        
        # Determine passenger count
        base = random.randint(5, 15)
        if is_peak and not is_weekend:
            base += random.randint(20, 35) # Rush hour
        if is_weekend:
            base += random.randint(0, 10) # Weekend
        
        features.append([float(route_int), float(hour), float(day)])
        targets.append(float(base))
    return features, targets


def write_history_to_influx(records: List[dict]) -> bool:
    if not records or InfluxDBClient is None:
        return False
    try:
        with InfluxDBClient(url=INFLUXDB_URL, token=INFLUX_TOKEN, org=INFLUX_ORG) as client:
            write_api = client.write_api(write_options=SYNCHRONOUS)
            points = [
                Point("traffic_history")
                .tag("source", "mock_seed")
                .field("hour", row["hour"])
                .field("vehicle_count", row["vehicle_count"])
                .field("bus_delay_minutes", row["bus_delay_minutes"])
                .field("future_vehicle_count", row["future_vehicle_count"])
                for row in records
            ]
            write_api.write(bucket=INFLUX_BUCKET, org=INFLUX_ORG, record=points)
        return True
    except Exception:
        return False


def fetch_historical_data_from_influx() -> List[dict]:
    if InfluxDBClient is None:
        return []
    try:
        with InfluxDBClient(url=INFLUXDB_URL, token=INFLUX_TOKEN, org=INFLUX_ORG) as client:
            query_api = client.query_api()
            query = f'from(bucket:"{INFLUX_BUCKET}") |> range(start: -7d) |> filter(fn: (r) => r._measurement == "traffic_history") |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")'
            tables = query_api.query(query)
            records = []
            for table in tables:
                for record in table.records:
                    records.append({
                        "hour": record.values.get("hour", 0),
                        "vehicle_count": record.values.get("vehicle_count", 0),
                        "bus_delay_minutes": record.values.get("bus_delay_minutes", 0),
                        "future_vehicle_count": record.values.get("future_vehicle_count", 0),
                    })
            return records
    except Exception:
        return []


def train_model(rows: int = 288) -> dict:
    global MODEL, CROWD_MODEL, MODEL_TRAINED_AT, MODEL_VERSION, LAST_TRAINING_ROWS

    samples = fetch_historical_data_from_influx()
    influx_written = False
    if not samples:
        samples = generate_mock_historical_data(rows)
        influx_written = write_history_to_influx(samples)
        
    features = [_feature_row(s["hour"], s["vehicle_count"], s["bus_delay_minutes"]) for s in samples]
    targets = [s["future_vehicle_count"] for s in samples]

    model = LinearRegression()
    model.fit(features, targets)
    MODEL = model

    # Train crowd model
    c_features, c_targets = generate_mock_crowd_data(max(rows, 500))
    crowd_model = RandomForestRegressor(n_estimators=50, random_state=42)
    crowd_model.fit(c_features, c_targets)
    CROWD_MODEL = crowd_model

    MODEL_VERSION += 1
    LAST_TRAINING_ROWS = len(samples)
    MODEL_TRAINED_AT = utcnow().isoformat()

    return {
        "model_version": MODEL_VERSION,
        "trained_at": MODEL_TRAINED_AT,
        "rows": rows,
        "influx_written": influx_written,
    }


async def send_predictive_alert(request: PredictionRequest, predicted_vehicle_count: int) -> bool:
    payload = {
        "lane": request.lane,
        "intersection_id": request.intersection_id,
        "predicted_vehicle_count": predicted_vehicle_count,
        "predicted_for_minutes": request.lead_minutes,
        "recommended_max_green_s": min(
            MAX_RECOMMENDED_GREEN_S,
            BASE_RECOMMENDED_GREEN_S
            + max(MIN_ADDITIONAL_GREEN_S, predicted_vehicle_count - HIGH_CONGESTION_THRESHOLD),
        ),
        "expires_in_minutes": request.lead_minutes,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{BACKEND_BASE_URL}/api/v1/traffic/predictive-alert",
                json=payload,
                headers={"x-prediction-token": PREDICTION_TOKEN},
            )
            response.raise_for_status()
        return True
    except httpx.HTTPError:
        return False


async def periodic_training_loop() -> None:
    while True:
        await asyncio.sleep(MODEL_UPDATE_INTERVAL_SECONDS)
        train_model()


@asynccontextmanager
async def lifespan(_: FastAPI):
    train_model()
    task = asyncio.create_task(periodic_training_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Synapse City OS - Prediction Engine", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model_version": MODEL_VERSION,
        "trained_at": MODEL_TRAINED_AT,
        "rows": LAST_TRAINING_ROWS,
    }


@app.post("/api/v1/prediction/train")
def trigger_training(payload: TrainingRequest) -> dict:
    return train_model(payload.rows)


@app.post("/api/v1/prediction/forecast")
async def forecast(payload: PredictionRequest) -> dict:
    if MODEL is None:
        raise HTTPException(status_code=503, detail="model not trained")

    hour = utcnow().hour
    features = _feature_row(hour, payload.current_vehicle_count, payload.bus_delay_minutes)
    prediction = MODEL.predict([features])[0]
    predicted_vehicle_count = int(round(prediction))
    is_high_congestion = predicted_vehicle_count >= HIGH_CONGESTION_THRESHOLD
    alert_sent = False
    if is_high_congestion:
        alert_sent = await send_predictive_alert(payload, predicted_vehicle_count)

    return {
        "lane": payload.lane,
        "intersection_id": payload.intersection_id,
        "lead_minutes": payload.lead_minutes,
        "predicted_vehicle_count": predicted_vehicle_count,
        "high_congestion": is_high_congestion,
        "alert_sent": alert_sent,
        "model_version": MODEL_VERSION,
    }


@app.post("/api/v1/prediction/crowd")
async def predict_crowd(payload: CrowdPredictionRequest) -> dict:
    if CROWD_MODEL is None:
        raise HTTPException(status_code=503, detail="crowd model not trained")

    route_int = _route_id_to_int(payload.route_id)
    features = [float(route_int), float(payload.hour), float(payload.day)]
    prediction = CROWD_MODEL.predict([features])[0]
    
    return {
        "route_id": payload.route_id,
        "hour": payload.hour,
        "day": payload.day,
        "predicted_passengers": int(round(prediction)),
        "model_version": MODEL_VERSION,
    }


@app.post("/api/v1/prediction/mock-seed")
def seed_mock_data(payload: TrainingRequest) -> dict:
    samples = generate_mock_historical_data(payload.rows)
    return {
        "rows": payload.rows,
        "influx_written": write_history_to_influx(samples),
    }
