from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field


app = FastAPI(title="Synapse City OS - Phase 1 MVP")


class TrafficIngest(BaseModel):
    lane: str
    vehicle_count: int = Field(ge=0)
    pedestrian_count: int = Field(ge=0)
    sensor_id: str = "edge-camera-1"


class TrafficDecisionRequest(BaseModel):
    lane: str
    current_green_elapsed_s: int = Field(ge=0, default=0)


class RoadIntegrityIngest(BaseModel):
    bus_id: str
    latitude: float
    longitude: float
    z_accel: float
    recorded_at: Optional[datetime] = None


@dataclass
class LaneState:
    vehicle_count: int = 0
    pedestrian_count: int = 0
    last_nonzero_vehicle_seen_at: Optional[datetime] = None


@dataclass
class SensorState:
    last_heartbeat_at: Optional[datetime] = None


MIN_GREEN_SECONDS = 5
MAX_GREEN_SECONDS = 120
GAP_OUT_SECONDS = 3
HISTORICAL_FALLBACK_SECONDS_BY_HOUR = {
    "peak": 50,
    "off_peak": 20,
}
POTHOLE_Z_THRESHOLD = 2.5

LANE_STORE: Dict[str, LaneState] = {}
SENSOR_STORE: Dict[str, SensorState] = {}
ROAD_ANOMALIES: List[dict] = []


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def historical_fallback_timer(now: Optional[datetime] = None) -> int:
    current = now or utcnow()
    return (
        HISTORICAL_FALLBACK_SECONDS_BY_HOUR["peak"]
        if current.hour in {8, 9, 17, 18, 19}
        else HISTORICAL_FALLBACK_SECONDS_BY_HOUR["off_peak"]
    )


def evaluate_dynamic_actuation(
    lane: LaneState, current_green_elapsed_s: int, now: Optional[datetime] = None
) -> dict:
    current = now or utcnow()
    estimated_green = min(MAX_GREEN_SECONDS, max(MIN_GREEN_SECONDS, MIN_GREEN_SECONDS + lane.vehicle_count * 2))

    can_gap_out = current_green_elapsed_s >= MIN_GREEN_SECONDS and lane.vehicle_count == 0
    no_recent_vehicle = (
        lane.last_nonzero_vehicle_seen_at is None
        or (current - lane.last_nonzero_vehicle_seen_at) >= timedelta(seconds=GAP_OUT_SECONDS)
    )
    gap_out = can_gap_out and no_recent_vehicle

    return {
        "min_green_s": MIN_GREEN_SECONDS,
        "max_green_s": MAX_GREEN_SECONDS,
        "estimated_green_s": estimated_green,
        "gap_out": gap_out,
        "terminate_green_early": gap_out,
    }


def sensor_failed(sensor_id: str, now: Optional[datetime] = None) -> bool:
    sensor = SENSOR_STORE.get(sensor_id)
    if sensor is None or sensor.last_heartbeat_at is None:
        return True
    current = now or utcnow()
    return (current - sensor.last_heartbeat_at) > timedelta(seconds=3)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/ingest/traffic")
def ingest_traffic(payload: TrafficIngest) -> dict:
    now = utcnow()
    lane = LANE_STORE.setdefault(payload.lane, LaneState())
    lane.vehicle_count = payload.vehicle_count
    lane.pedestrian_count = payload.pedestrian_count

    if payload.vehicle_count > 0:
        lane.last_nonzero_vehicle_seen_at = now

    return {
        "message": "traffic data ingested",
        "lane": payload.lane,
        "vehicle_count": payload.vehicle_count,
        "pedestrian_count": payload.pedestrian_count,
    }


@app.post("/traffic/decision")
def traffic_decision(payload: TrafficDecisionRequest, sensor_id: str = "edge-camera-1") -> dict:
    lane = LANE_STORE.setdefault(payload.lane, LaneState())

    if sensor_failed(sensor_id):
        return {
            "lane": payload.lane,
            "mode": "historical_fallback",
            "sensor_status": "sensor_failure",
            "fallback_green_s": historical_fallback_timer(),
            "decision": {
                "min_green_s": MIN_GREEN_SECONDS,
                "max_green_s": MAX_GREEN_SECONDS,
                "estimated_green_s": historical_fallback_timer(),
                "gap_out": False,
                "terminate_green_early": False,
            },
        }

    return {
        "lane": payload.lane,
        "mode": "dynamic",
        "sensor_status": "healthy",
        "decision": evaluate_dynamic_actuation(lane, payload.current_green_elapsed_s),
    }


@app.post("/heartbeat/{sensor_id}")
def heartbeat(sensor_id: str) -> dict:
    SENSOR_STORE.setdefault(sensor_id, SensorState()).last_heartbeat_at = utcnow()
    return {"sensor_id": sensor_id, "status": "heartbeat_received"}


@app.get("/heartbeat/{sensor_id}")
def heartbeat_status(sensor_id: str) -> dict:
    failed = sensor_failed(sensor_id)
    return {
        "sensor_id": sensor_id,
        "status": "sensor_failure" if failed else "healthy",
        "fallback_timer_s": historical_fallback_timer() if failed else None,
    }


@app.post("/ingest/road-integrity")
def ingest_road_integrity(payload: RoadIntegrityIngest) -> dict:
    ts = payload.recorded_at or utcnow()
    is_anomaly = abs(payload.z_accel) >= POTHOLE_Z_THRESHOLD
    anomaly = {
        "bus_id": payload.bus_id,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "z_accel": payload.z_accel,
        "recorded_at": ts.isoformat(),
        "is_anomaly": is_anomaly,
    }
    if is_anomaly:
        ROAD_ANOMALIES.append(anomaly)

    return {
        "message": "road integrity data ingested",
        "is_anomaly": is_anomaly,
        "threshold": POTHOLE_Z_THRESHOLD,
        "action": "divert_heavy_traffic" if is_anomaly else "no_action",
    }


@app.get("/ingest/road-integrity/anomalies")
def road_anomalies() -> dict:
    return {"count": len(ROAD_ANOMALIES), "items": ROAD_ANOMALIES}
