from __future__ import annotations

import asyncio
import os
import random
from datetime import datetime, timezone
from typing import List, Optional

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sklearn.linear_model import LinearRegression

try:
    from influxdb_client import InfluxDBClient, Point
    from influxdb_client.client.write_api import SYNCHRONOUS
except Exception:  # pragma: no cover
    InfluxDBClient = None
    Point = None
    SYNCHRONOUS = None


app = FastAPI(title="Synapse City OS - Prediction Engine")

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://backend:8000")
PREDICTION_TOKEN = os.getenv("PREDICTION_ENGINE_TOKEN", "synapse-prediction-token")
MODEL_UPDATE_INTERVAL_SECONDS = int(os.getenv("MODEL_UPDATE_INTERVAL_SECONDS", "300"))
HIGH_CONGESTION_THRESHOLD = int(os.getenv("HIGH_CONGESTION_THRESHOLD", "30"))

INFLUX_URL = os.getenv("INFLUX_URL", "http://influxdb:8086")
INFLUX_ORG = os.getenv("INFLUX_ORG", "synapse-city")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "traffic_analytics")
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN", "synapse-influx-token")

MODEL: Optional[LinearRegression] = None
MODEL_VERSION = 0
MODEL_TRAINED_AT: Optional[str] = None
LAST_TRAINING_ROWS = 0


class PredictionRequest(BaseModel):
    lane: str
    intersection_id: Optional[str] = None
    current_vehicle_count: int = Field(ge=0)
    bus_delay_minutes: float = Field(default=0.0, ge=0)
    lead_minutes: int = Field(default=30, ge=15, le=30)


class TrainingRequest(BaseModel):
    rows: int = Field(default=288, ge=48, le=3000)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _feature_row(hour: int, vehicle_count: int, bus_delay_minutes: float) -> List[float]:
    return [float(hour), float(vehicle_count), float(bus_delay_minutes)]


def generate_mock_historical_data(rows: int = 288) -> List[dict]:
    records: List[dict] = []
    for i in range(rows):
        hour = (i // 12) % 24
        is_peak = hour in {7, 8, 9, 17, 18, 19}
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


def write_history_to_influx(records: List[dict]) -> bool:
    if not records or InfluxDBClient is None:
        return False
    try:
        with InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG) as client:
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


def train_model(rows: int = 288) -> dict:
    global MODEL, MODEL_TRAINED_AT, MODEL_VERSION, LAST_TRAINING_ROWS

    samples = generate_mock_historical_data(rows)
    features = [_feature_row(s["hour"], s["vehicle_count"], s["bus_delay_minutes"]) for s in samples]
    targets = [s["future_vehicle_count"] for s in samples]

    model = LinearRegression()
    model.fit(features, targets)

    MODEL = model
    MODEL_VERSION += 1
    LAST_TRAINING_ROWS = rows
    MODEL_TRAINED_AT = utcnow().isoformat()
    influx_written = write_history_to_influx(samples)

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
        "recommended_max_green_s": min(180, 120 + max(15, predicted_vehicle_count - HIGH_CONGESTION_THRESHOLD)),
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
        train_model()
        await asyncio.sleep(MODEL_UPDATE_INTERVAL_SECONDS)


@app.on_event("startup")
async def startup_train() -> None:
    train_model()
    asyncio.create_task(periodic_training_loop())


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
    predicted_vehicle_count = int(round(MODEL.predict([_feature_row(hour, payload.current_vehicle_count, payload.bus_delay_minutes)])[0]))
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


@app.post("/api/v1/prediction/mock-seed")
def seed_mock_data(payload: TrainingRequest) -> dict:
    samples = generate_mock_historical_data(payload.rows)
    return {
        "rows": payload.rows,
        "influx_written": write_history_to_influx(samples),
    }
