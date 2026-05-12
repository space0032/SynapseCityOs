from fastapi.testclient import TestClient

import app.main as gateway_main


client = TestClient(gateway_main.app)


class DummyResponse:
    def __init__(self, payload):
        self.payload = payload


async def fake_fetch_json(method: str, url: str, **kwargs):
    if url.endswith("/api/v1/admin/live-traffic"):
        return {"count": 1, "items": [{"intersection_id": "INT-1", "signal_state": "GREEN", "vehicle_count": 7}]}
    if url.endswith("/ingest/road-integrity/anomalies"):
        return {"count": 1, "items": [{"latitude": 22.3, "longitude": 73.2}]}
    if url.endswith("/api/v1/traffic/overrides"):
        return {"count": 1, "items": [{"intersection_id": "INT-1", "mode": "god_mode_override"}]}
    if url.endswith("/api/v1/pollution/high"):
        return {"count": 1, "items": [{"zone_id": "ZONE-A", "high_pollution": True}]}
    if "/api/v1/commuter/buses/" in url:
        return {"route_id": "R1", "buses": [{"bus_id": "BUS-1"}]}
    if url.endswith("/api/v1/commuter/parking"):
        return {"count": 1, "items": [{"slot_id": "P2"}], "query": kwargs.get("params", {})}
    return {}


def test_admin_active_alerts_aggregation(monkeypatch):
    monkeypatch.setattr(gateway_main, "fetch_json", fake_fetch_json)

    response = client.get("/api/admin/active-alerts")
    assert response.status_code == 200
    body = response.json()
    assert body["emergency_overrides"]["count"] == 1
    assert body["high_pollution_zones"]["count"] == 1


def test_public_commuter_aggregation(monkeypatch):
    monkeypatch.setattr(gateway_main, "fetch_json", fake_fetch_json)

    response = client.get("/api/public/commuter?route_id=R1&latitude=22.30&longitude=73.20&parking_limit=2")
    assert response.status_code == 200
    body = response.json()
    assert body["route_id"] == "R1"
    assert body["bus_tracking"]["route_id"] == "R1"
    assert body["smart_parking"]["count"] == 1
    assert body["air_quality"]["count"] == 1
