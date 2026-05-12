from __future__ import annotations

import os
import secrets
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from itertools import islice
from math import atan2, cos, radians, sin, sqrt
from typing import Deque, Dict, List, Optional

from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field


app = FastAPI(title="Synapse City OS - Phase 3")


class TrafficIngest(BaseModel):
    lane: str
    vehicle_count: int = Field(ge=0)
    pedestrian_count: int = Field(ge=0)
    sensor_id: str = "edge-camera-1"


class TrafficDecisionRequest(BaseModel):
    lane: str
    current_green_elapsed_s: int = Field(ge=0, default=0)
    sensor_id: str = "edge-camera-1"
    intersection_id: Optional[str] = None


class RoadIntegrityIngest(BaseModel):
    bus_id: str
    latitude: float
    longitude: float
    z_accel: float
    recorded_at: Optional[datetime] = None


class EmergencyPingIngest(BaseModel):
    vehicle_id: str
    vehicle_type: str
    intersection_id: str
    latitude: float
    longitude: float
    speed: float = Field(ge=0)
    route_intersections: List[str] = Field(default_factory=list)
    recorded_at: Optional[datetime] = None


class PollutionIngest(BaseModel):
    zone_id: str
    intersection_id: Optional[str] = None
    aqi: float = Field(ge=0)
    pm25: float = Field(ge=0)
    no2: float = Field(ge=0)
    recorded_at: Optional[datetime] = None


class ParkingSlotIngest(BaseModel):
    slot_id: str
    zone_id: str
    latitude: float
    longitude: float
    occupied: bool
    recorded_at: Optional[datetime] = None


class V2PAlertIngest(BaseModel):
    event_id: str
    intersection_id: str
    camera_id: str
    latitude: float
    longitude: float
    danger_type: str
    severity: str = "high"
    detected_at: Optional[datetime] = None


class PredictiveCongestionAlertIngest(BaseModel):
    lane: str
    intersection_id: Optional[str] = None
    predicted_vehicle_count: int = Field(ge=0)
    predicted_for_minutes: int = Field(default=30, ge=15, le=30)
    recommended_max_green_s: int = Field(default=150, ge=5, le=180)
    expires_in_minutes: int = Field(default=30, ge=1, le=60)


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
EMERGENCY_OVERRIDE_SECONDS = 60
EARTH_RADIUS_M = 6371000
POLLUTION_AQI_THRESHOLD = float(os.getenv("POLLUTION_AQI_THRESHOLD", "150"))
POLLUTION_PM25_THRESHOLD = float(os.getenv("POLLUTION_PM25_THRESHOLD", "55"))
POLLUTION_NO2_THRESHOLD = float(os.getenv("POLLUTION_NO2_THRESHOLD", "100"))
EMERGENCY_API_TOKEN = os.getenv("EMERGENCY_API_TOKEN", "synapse-emergency-token")
PREDICTION_ENGINE_TOKEN = os.getenv("PREDICTION_ENGINE_TOKEN", "synapse-prediction-token")

LANE_STORE: Dict[str, LaneState] = {}
SENSOR_STORE: Dict[str, SensorState] = {}
ROAD_ANOMALIES: List[dict] = []
EMERGENCY_OVERRIDES: Dict[str, dict] = {}
POLLUTION_ZONES: Dict[str, dict] = {}
PARKING_SLOTS: Dict[str, dict] = {}
V2P_ALERTS: Deque[dict] = deque(maxlen=500)
PREDICTIVE_CONGESTION_ALERTS: Dict[str, dict] = {}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def historical_fallback_timer(now: Optional[datetime] = None) -> int:
    current = now or utcnow()
    return (
        HISTORICAL_FALLBACK_SECONDS_BY_HOUR["peak"]
        if current.hour in {8, 9, 17, 18, 19}
        else HISTORICAL_FALLBACK_SECONDS_BY_HOUR["off_peak"]
    )


def active_predictive_alert(lane_name: str, now: Optional[datetime] = None) -> Optional[dict]:
    alert = PREDICTIVE_CONGESTION_ALERTS.get(lane_name)
    if alert is None:
        return None
    current = now or utcnow()
    if datetime.fromisoformat(alert["expires_at"]) <= current:
        PREDICTIVE_CONGESTION_ALERTS.pop(lane_name, None)
        return None
    return alert


def evaluate_dynamic_actuation(
    lane: LaneState,
    current_green_elapsed_s: int,
    now: Optional[datetime] = None,
    predictive_alert: Optional[dict] = None,
) -> dict:
    current = now or utcnow()
    max_green = MAX_GREEN_SECONDS
    if predictive_alert is not None:
        max_green = max(MAX_GREEN_SECONDS, predictive_alert["recommended_max_green_s"])
    estimated_green = min(max_green, max(MIN_GREEN_SECONDS, MIN_GREEN_SECONDS + lane.vehicle_count * 2))

    can_gap_out = current_green_elapsed_s >= MIN_GREEN_SECONDS and lane.vehicle_count == 0
    no_recent_vehicle = (
        lane.last_nonzero_vehicle_seen_at is None
        or (current - lane.last_nonzero_vehicle_seen_at) >= timedelta(seconds=GAP_OUT_SECONDS)
    )
    gap_out = can_gap_out and no_recent_vehicle

    return {
        "min_green_s": MIN_GREEN_SECONDS,
        "max_green_s": max_green,
        "estimated_green_s": estimated_green,
        "gap_out": gap_out,
        "terminate_green_early": gap_out,
        "proactive_adjustment_applied": predictive_alert is not None,
        "predictive_alert": predictive_alert,
    }


def sensor_failed(sensor_id: str, now: Optional[datetime] = None) -> bool:
    sensor = SENSOR_STORE.get(sensor_id)
    if sensor is None or sensor.last_heartbeat_at is None:
        return True
    current = now or utcnow()
    return (current - sensor.last_heartbeat_at) > timedelta(seconds=3)


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return EARTH_RADIUS_M * c


def active_override(intersection_id: str, now: Optional[datetime] = None) -> Optional[dict]:
    override = EMERGENCY_OVERRIDES.get(intersection_id)
    if override is None:
        return None
    current = now or utcnow()
    if datetime.fromisoformat(override["expires_at"]) <= current:
        EMERGENCY_OVERRIDES.pop(intersection_id, None)
        return None
    return override


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
def traffic_decision(payload: TrafficDecisionRequest) -> dict:
    lane = LANE_STORE.setdefault(payload.lane, LaneState())
    predictive_alert = active_predictive_alert(payload.lane)

    if payload.intersection_id:
        override = active_override(payload.intersection_id)
        if override:
            return {
                "lane": payload.lane,
                "intersection_id": payload.intersection_id,
                "mode": "god_mode_override",
                "sensor_status": "healthy",
                "decision": {
                    "cross_traffic_signal": "ALL_RED",
                    "emergency_path_signal": "GREEN_WAVE",
                    "expires_at": override["expires_at"],
                },
            }

    if sensor_failed(payload.sensor_id):
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
        "decision": evaluate_dynamic_actuation(
            lane,
            payload.current_green_elapsed_s,
            predictive_alert=predictive_alert,
        ),
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


@app.post("/api/v1/emergency/priority-ping")
def emergency_priority_ping(
    payload: EmergencyPingIngest,
    emergency_token: Optional[str] = Header(default=None, alias="x-emergency-token"),
) -> dict:
    if emergency_token is None or not secrets.compare_digest(emergency_token, EMERGENCY_API_TOKEN):
        raise HTTPException(status_code=401, detail="invalid emergency token")

    now = payload.recorded_at or utcnow()
    route = payload.route_intersections or [payload.intersection_id]

    for intersection_id in route:
        EMERGENCY_OVERRIDES[intersection_id] = {
            "intersection_id": intersection_id,
            "vehicle_id": payload.vehicle_id,
            "vehicle_type": payload.vehicle_type,
            "mode": "god_mode_override",
            "cross_traffic_signal": "ALL_RED",
            "emergency_path_signal": "GREEN_WAVE",
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(seconds=EMERGENCY_OVERRIDE_SECONDS)).isoformat(),
        }

    return {
        "message": "emergency ping ingested",
        "vehicle_id": payload.vehicle_id,
        "path_intersections": route,
        "override_triggered": True,
    }


@app.get("/api/v1/traffic/overrides/{intersection_id}")
def get_traffic_override(intersection_id: str) -> dict:
    override = active_override(intersection_id)
    return {
        "intersection_id": intersection_id,
        "active": override is not None,
        "override": override,
    }


@app.get("/api/v1/traffic/overrides")
def list_traffic_overrides() -> dict:
    active = []
    for intersection_id in list(EMERGENCY_OVERRIDES.keys()):
        override = active_override(intersection_id)
        if override is not None:
            active.append(override)
    return {"count": len(active), "items": active}


@app.post("/api/v1/pollution/ingest")
def ingest_pollution(payload: PollutionIngest) -> dict:
    now = payload.recorded_at or utcnow()
    is_high = (
        payload.aqi >= POLLUTION_AQI_THRESHOLD
        or payload.pm25 >= POLLUTION_PM25_THRESHOLD
        or payload.no2 >= POLLUTION_NO2_THRESHOLD
    )
    POLLUTION_ZONES[payload.zone_id] = {
        "zone_id": payload.zone_id,
        "intersection_id": payload.intersection_id,
        "aqi": payload.aqi,
        "pm25": payload.pm25,
        "no2": payload.no2,
        "recorded_at": now.isoformat(),
        "high_pollution": is_high,
    }

    return {
        "message": "pollution data ingested",
        "zone_id": payload.zone_id,
        "high_pollution": is_high,
        "suggested_action": "divert_traffic" if is_high else "normal_flow",
    }


@app.get("/api/v1/pollution/high")
def high_pollution_zones() -> dict:
    items = [item for item in POLLUTION_ZONES.values() if item["high_pollution"]]
    return {"count": len(items), "items": items}


@app.post("/api/v1/parking/ingest")
def ingest_parking(payload: ParkingSlotIngest) -> dict:
    ts = payload.recorded_at or utcnow()
    PARKING_SLOTS[payload.slot_id] = {
        "slot_id": payload.slot_id,
        "zone_id": payload.zone_id,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "occupied": payload.occupied,
        "recorded_at": ts.isoformat(),
    }
    return {"message": "parking slot data ingested", "slot_id": payload.slot_id, "occupied": payload.occupied}


@app.get("/api/v1/commuter/parking")
def nearest_available_parking(
    latitude: float,
    longitude: float,
    limit: int = Query(default=5, ge=1, le=100),
) -> dict:
    available = []
    for slot in PARKING_SLOTS.values():
        if slot["occupied"]:
            continue
        distance_m = haversine_meters(latitude, longitude, slot["latitude"], slot["longitude"])
        available.append({**slot, "distance_m": round(distance_m, 2)})

    nearest = sorted(available, key=lambda x: x["distance_m"])[:limit]
    return {"query": {"latitude": latitude, "longitude": longitude, "limit": limit}, "count": len(nearest), "items": nearest}


@app.post("/api/v1/v2p/alert")
def ingest_v2p_alert(payload: V2PAlertIngest) -> dict:
    ts = payload.detected_at or utcnow()
    alert = {
        "event_id": payload.event_id,
        "intersection_id": payload.intersection_id,
        "camera_id": payload.camera_id,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "danger_type": payload.danger_type,
        "severity": payload.severity,
        "detected_at": ts.isoformat(),
    }
    V2P_ALERTS.append(alert)

    return {
        "message": "v2p alert broadcast",
        "channels": ["pedestrian_app", "vehicle_dashboard"],
        "alert": alert,
    }


@app.get("/api/v1/v2p/alerts")
def list_v2p_alerts(limit: int = Query(default=20, ge=1, le=100)) -> dict:
    items = list(islice(reversed(V2P_ALERTS), limit))
    items.reverse()
    return {"count": len(items), "items": items}


@app.post("/api/v1/traffic/predictive-alert")
def ingest_predictive_traffic_alert(
    payload: PredictiveCongestionAlertIngest,
    prediction_token: Optional[str] = Header(default=None, alias="x-prediction-token"),
) -> dict:
    if prediction_token is None or not secrets.compare_digest(prediction_token, PREDICTION_ENGINE_TOKEN):
        raise HTTPException(status_code=401, detail="invalid prediction token")

    now = utcnow()
    lane_name = payload.lane
    PREDICTIVE_CONGESTION_ALERTS[lane_name] = {
        "lane": lane_name,
        "intersection_id": payload.intersection_id,
        "predicted_vehicle_count": payload.predicted_vehicle_count,
        "predicted_for_minutes": payload.predicted_for_minutes,
        "recommended_max_green_s": payload.recommended_max_green_s,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=payload.expires_in_minutes)).isoformat(),
    }
    return {
        "message": "predictive congestion alert ingested",
        "lane": lane_name,
        "preemptive_signal_adjustment": True,
        "alert": PREDICTIVE_CONGESTION_ALERTS[lane_name],
    }


@app.get("/api/v1/admin/live-traffic")
def admin_live_traffic() -> dict:
    intersections = []
    for lane_name in sorted(LANE_STORE.keys()):
        lane = LANE_STORE[lane_name]
        intersections.append(
            {
                "intersection_id": lane_name,
                "signal_state": "GREEN" if lane.vehicle_count > 0 else "RED",
                "vehicle_count": lane.vehicle_count,
            }
        )
    return {"count": len(intersections), "items": intersections}
