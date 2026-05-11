from datetime import timedelta

from fastapi.testclient import TestClient

from app.main import app, utcnow, SENSOR_STORE, SensorState, ROAD_ANOMALIES, LANE_STORE


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
