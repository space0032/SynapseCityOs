from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware


BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://backend:8000")
FLEET_BASE_URL = os.getenv("FLEET_BASE_URL", "http://fleet-service:8080")
PREDICTION_BASE_URL = os.getenv("PREDICTION_BASE_URL", "http://prediction-engine:9100")
REQUEST_TIMEOUT_SECONDS = 10.0

app = FastAPI(title="Synapse City OS - API Gateway")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def fetch_json(method: str, url: str, **kwargs: Any) -> Any:
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.request(method, url, **kwargs)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "upstream service error",
                "upstream_status_code": exc.response.status_code,
                "upstream_url": str(exc.request.url),
            },
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail={"message": "upstream service unavailable", "error": str(exc)}) from exc


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/gateway/traffic/decision")
async def gateway_traffic_decision(payload: dict) -> Any:
    return await fetch_json("POST", f"{BACKEND_BASE_URL}/traffic/decision", json=payload)


@app.post("/api/gateway/fleet/telemetry")
async def gateway_fleet_telemetry(payload: dict) -> Any:
    return await fetch_json("POST", f"{FLEET_BASE_URL}/api/v1/fleet/telemetry", json=payload)


@app.get("/api/gateway/alerts/pollution/high")
async def gateway_high_pollution_alerts() -> Any:
    return await fetch_json("GET", f"{BACKEND_BASE_URL}/api/v1/pollution/high")


@app.get("/api/gateway/parking/availability")
async def gateway_parking_availability(
    latitude: float,
    longitude: float,
    limit: int = Query(default=5, ge=1, le=100),
) -> Any:
    return await fetch_json(
        "GET",
        f"{BACKEND_BASE_URL}/api/v1/commuter/parking",
        params={"latitude": latitude, "longitude": longitude, "limit": limit},
    )


@app.get("/api/admin/live-traffic")
async def admin_live_traffic() -> Any:
    return await fetch_json("GET", f"{BACKEND_BASE_URL}/api/v1/admin/live-traffic")


@app.get("/api/admin/road-health")
async def admin_road_health() -> Any:
    return await fetch_json("GET", f"{BACKEND_BASE_URL}/ingest/road-integrity/anomalies")


@app.get("/api/admin/active-alerts")
async def admin_active_alerts() -> dict:
    emergency_overrides = await fetch_json("GET", f"{BACKEND_BASE_URL}/api/v1/traffic/overrides")
    high_pollution = await fetch_json("GET", f"{BACKEND_BASE_URL}/api/v1/pollution/high")
    return {
        "emergency_overrides": emergency_overrides,
        "high_pollution_zones": high_pollution,
    }


@app.get("/api/admin/cameras")
async def admin_list_cameras() -> Any:
    return await fetch_json("GET", f"{BACKEND_BASE_URL}/api/v1/admin/cameras")


@app.post("/api/admin/cameras")
async def admin_add_camera(payload: dict) -> Any:
    return await fetch_json("POST", f"{BACKEND_BASE_URL}/api/v1/admin/cameras", json=payload)


@app.delete("/api/admin/cameras/{sensor_id}")
async def admin_delete_camera(sensor_id: str) -> Any:
    return await fetch_json("DELETE", f"{BACKEND_BASE_URL}/api/v1/admin/cameras/{sensor_id}")


@app.get("/api/admin/fleet")
async def admin_get_fleet() -> Any:
    return await fetch_json("GET", f"{FLEET_BASE_URL}/api/v1/admin/fleet")


@app.post("/api/admin/fleet/{bus_id}/action")
async def admin_fleet_action(bus_id: str, payload: dict) -> Any:
    return await fetch_json("POST", f"{FLEET_BASE_URL}/api/v1/admin/fleet/{bus_id}/action", json=payload)


@app.get("/api/public/routes")
async def public_routes() -> Any:
    """Returns distinct route IDs from the fleet service for the commuter route picker."""
    return await fetch_json("GET", f"{FLEET_BASE_URL}/api/v1/commuter/routes")


@app.get("/api/public/aqi")
async def public_aqi() -> Any:
    """Returns all pollution zone data (high + normal) for the commuter AQI panel."""
    try:
        return await fetch_json("GET", f"{BACKEND_BASE_URL}/api/v1/pollution/all")
    except HTTPException:
        # Fall back to high-pollution only if /all doesn't exist
        return await fetch_json("GET", f"{BACKEND_BASE_URL}/api/v1/pollution/high")


@app.get("/api/public/commuter")
async def public_commuter_status(
    route_id: str,
    latitude: float,
    longitude: float,
    parking_limit: int = Query(default=5, ge=1, le=100),
) -> dict:
    buses = await fetch_json("GET", f"{FLEET_BASE_URL}/api/v1/commuter/buses/{route_id}")
    parking = await fetch_json(
        "GET",
        f"{BACKEND_BASE_URL}/api/v1/commuter/parking",
        params={"latitude": latitude, "longitude": longitude, "limit": parking_limit},
    )
    air_quality = await fetch_json("GET", f"{BACKEND_BASE_URL}/api/v1/pollution/high")

    return {
        "route_id": route_id,
        "bus_tracking": buses,
        "smart_parking": parking,
        "air_quality": air_quality,
    }


@app.post("/api/prediction/forecast")
async def prediction_forecast(payload: dict) -> Any:
    return await fetch_json("POST", f"{PREDICTION_BASE_URL}/api/v1/prediction/forecast", json=payload)


@app.post("/api/prediction/train")
async def prediction_train(payload: dict = {}) -> Any:
    return await fetch_json("POST", f"{PREDICTION_BASE_URL}/api/v1/prediction/train", json=payload)


@app.get("/api/prediction/health")
async def prediction_health() -> Any:
    return await fetch_json("GET", f"{PREDICTION_BASE_URL}/health")

