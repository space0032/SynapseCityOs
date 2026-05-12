from datetime import timedelta

from fastapi.testclient import TestClient

from app.main import (
    EMERGENCY_API_TOKEN,
    EMERGENCY_OVERRIDES,
    LANE_STORE,
    PARKING_SLOTS,
    PREDICTION_ENGINE_TOKEN,
    PREDICTIVE_CONGESTION_ALERTS,
    POLLUTION_ZONES,
    ROAD_ANOMALIES,
    SENSOR_STORE,
    V2P_ALERTS,
    SensorState,
    app,
    utcnow,
)


client = TestClient(app)


def test_dynamic_actuation_and_gap_out() -> None:
    lane = "North"
    client.post("/heartbeat/edge-camera-1")
    client.post(
        "/ingest/traffic",
        json={"lane": lane, "vehicle_count": 6, "pedestrian_count": 1, "sensor_id": "edge-camera-1"},
    )

    response = client.post("/traffic/decision", json={"lane": lane, "current_green_elapsed_s": 5})
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "dynamic"
    assert body["decision"]["estimated_green_s"] == 17
    assert body["decision"]["terminate_green_early"] is False

    client.post(
        "/ingest/traffic",
        json={"lane": lane, "vehicle_count": 0, "pedestrian_count": 0, "sensor_id": "edge-camera-1"},
    )
    response = client.post("/traffic/decision", json={"lane": lane, "current_green_elapsed_s": 7})
    assert response.status_code == 200
    assert response.json()["decision"]["terminate_green_early"] is False

    LANE_STORE[lane].last_nonzero_vehicle_seen_at = utcnow() - timedelta(seconds=4)
    response = client.post("/traffic/decision", json={"lane": lane, "current_green_elapsed_s": 7})
    assert response.status_code == 200
    assert response.json()["decision"]["terminate_green_early"] is True


def test_heartbeat_failure_uses_fallback() -> None:
    SENSOR_STORE["edge-camera-1"] = SensorState(last_heartbeat_at=utcnow() - timedelta(seconds=4))

    response = client.get("/heartbeat/edge-camera-1")
    assert response.status_code == 200
    assert response.json()["status"] == "sensor_failure"

    decision = client.post("/traffic/decision", json={"lane": "North", "current_green_elapsed_s": 5})
    assert decision.status_code == 200
    body = decision.json()
    assert body["mode"] == "historical_fallback"
    assert body["sensor_status"] == "sensor_failure"


def test_road_integrity_anomaly_detection() -> None:
    ROAD_ANOMALIES.clear()
    response = client.post(
        "/ingest/road-integrity",
        json={"bus_id": "BUS-1", "latitude": 22.3, "longitude": 73.2, "z_accel": 3.5},
    )

    assert response.status_code == 200
    assert response.json()["is_anomaly"] is True

    anomalies = client.get("/ingest/road-integrity/anomalies")
    assert anomalies.status_code == 200
    assert anomalies.json()["count"] == 1


def test_emergency_priority_triggers_god_mode_override() -> None:
    EMERGENCY_OVERRIDES.clear()
    response = client.post(
        "/api/v1/emergency/priority-ping",
        headers={"x-emergency-token": EMERGENCY_API_TOKEN},
        json={
            "vehicle_id": "AMB-11",
            "vehicle_type": "ambulance",
            "intersection_id": "INT-9",
            "latitude": 22.31,
            "longitude": 73.19,
            "speed": 43.2,
            "route_intersections": ["INT-9", "INT-10"],
        },
    )
    assert response.status_code == 200
    assert response.json()["override_triggered"] is True

    override = client.get("/api/v1/traffic/overrides/INT-9")
    assert override.status_code == 200
    assert override.json()["active"] is True

    decision = client.post(
        "/traffic/decision",
        json={"lane": "North", "current_green_elapsed_s": 1, "intersection_id": "INT-9"},
    )
    assert decision.status_code == 200
    assert decision.json()["mode"] == "god_mode_override"
    assert decision.json()["decision"]["cross_traffic_signal"] == "ALL_RED"


def test_pollution_high_zone_and_parking_nearest_slots() -> None:
    POLLUTION_ZONES.clear()
    PARKING_SLOTS.clear()

    pollution = client.post(
        "/api/v1/pollution/ingest",
        json={"zone_id": "ZONE-A", "intersection_id": "INT-A", "aqi": 180, "pm25": 20, "no2": 40},
    )
    assert pollution.status_code == 200
    assert pollution.json()["high_pollution"] is True

    high = client.get("/api/v1/pollution/high")
    assert high.status_code == 200
    assert high.json()["count"] == 1
    assert high.json()["items"][0]["zone_id"] == "ZONE-A"

    client.post(
        "/api/v1/parking/ingest",
        json={"slot_id": "P1", "zone_id": "ZONE-A", "latitude": 22.3000, "longitude": 73.2000, "occupied": True},
    )
    client.post(
        "/api/v1/parking/ingest",
        json={"slot_id": "P2", "zone_id": "ZONE-A", "latitude": 22.3002, "longitude": 73.2002, "occupied": False},
    )
    client.post(
        "/api/v1/parking/ingest",
        json={"slot_id": "P3", "zone_id": "ZONE-A", "latitude": 22.3010, "longitude": 73.2010, "occupied": False},
    )

    nearest = client.get("/api/v1/commuter/parking?latitude=22.3001&longitude=73.2001&limit=1")
    assert nearest.status_code == 200
    assert nearest.json()["count"] == 1
    assert nearest.json()["items"][0]["slot_id"] == "P2"


def test_v2p_alert_broadcast_feed() -> None:
    V2P_ALERTS.clear()
    response = client.post(
        "/api/v1/v2p/alert",
        json={
            "event_id": "EVT-1",
            "intersection_id": "INT-2",
            "camera_id": "CAM-9",
            "latitude": 22.32,
            "longitude": 73.22,
            "danger_type": "pedestrian_in_danger",
            "severity": "critical",
        },
    )
    assert response.status_code == 200
    assert "pedestrian_app" in response.json()["channels"]

    feed = client.get("/api/v1/v2p/alerts?limit=5")
    assert feed.status_code == 200
    assert feed.json()["count"] == 1
    assert feed.json()["items"][0]["event_id"] == "EVT-1"


def test_admin_live_traffic_status() -> None:
    LANE_STORE.clear()
    client.post("/ingest/traffic", json={"lane": "INT-1", "vehicle_count": 4, "pedestrian_count": 0, "sensor_id": "edge-camera-1"})
    client.post("/ingest/traffic", json={"lane": "INT-2", "vehicle_count": 0, "pedestrian_count": 1, "sensor_id": "edge-camera-1"})

    response = client.get("/api/v1/admin/live-traffic")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    assert body["items"][0]["intersection_id"] == "INT-1"
    assert body["items"][0]["signal_state"] == "GREEN"
    assert body["items"][1]["signal_state"] == "RED"


def test_list_active_traffic_overrides() -> None:
    EMERGENCY_OVERRIDES.clear()
    client.post(
        "/api/v1/emergency/priority-ping",
        headers={"x-emergency-token": EMERGENCY_API_TOKEN},
        json={
            "vehicle_id": "FIRE-2",
            "vehicle_type": "fire_truck",
            "intersection_id": "INT-5",
            "latitude": 22.31,
            "longitude": 73.19,
            "speed": 52.3,
            "route_intersections": ["INT-5"],
        },
    )

    response = client.get("/api/v1/traffic/overrides")
    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert response.json()["items"][0]["intersection_id"] == "INT-5"


def test_predictive_alert_preemptive_green_adjustment() -> None:
    lane = "North-Predictive"
    LANE_STORE.pop(lane, None)
    PREDICTIVE_CONGESTION_ALERTS.clear()
    client.post("/heartbeat/edge-camera-1")
    client.post(
        "/ingest/traffic",
        json={"lane": lane, "vehicle_count": 8, "pedestrian_count": 0, "sensor_id": "edge-camera-1"},
    )

    ingest = client.post(
        "/api/v1/traffic/predictive-alert",
        headers={"x-prediction-token": PREDICTION_ENGINE_TOKEN},
        json={
            "lane": lane,
            "intersection_id": "INT-77",
            "predicted_vehicle_count": 34,
            "predicted_for_minutes": 30,
            "recommended_max_green_s": 170,
            "expires_in_minutes": 15,
        },
    )
    assert ingest.status_code == 200

    decision = client.post("/traffic/decision", json={"lane": lane, "current_green_elapsed_s": 7})
    assert decision.status_code == 200
    body = decision.json()
    assert body["mode"] == "dynamic"
    assert body["decision"]["proactive_adjustment_applied"] is True
    assert body["decision"]["max_green_s"] == 170
    assert body["decision"]["predictive_alert"]["intersection_id"] == "INT-77"
