"""
Database persistence layer for Synapse City OS Backend.
Uses SQLAlchemy 2 async core with PostgreSQL (asyncpg driver).
Falls back gracefully to no-op if DB is unavailable.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://synapse:synapse@postgres:5432/synapsecity",
)

_engine = None
_metadata = None
cameras_table = None
parking_table = None
anomalies_table = None

try:
    from sqlalchemy import (
        Column, DateTime, Float, Integer, MetaData, String, Table, Boolean, Text,
    )
    from sqlalchemy.ext.asyncio import create_async_engine

    _engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True)
    _metadata = MetaData()

    cameras_table = Table(
        "cameras", _metadata,
        Column("sensor_id", String, primary_key=True),
        Column("source", Text, nullable=False),
        Column("lane", String, nullable=False),
        Column("created_at", DateTime(timezone=True), nullable=False),
    )

    parking_table = Table(
        "parking_slots", _metadata,
        Column("slot_id", String, primary_key=True),
        Column("zone_id", String, nullable=False),
        Column("latitude", Float, nullable=False),
        Column("longitude", Float, nullable=False),
        Column("distance_from_entrance", Float, nullable=False, default=0.0),
        Column("occupied", Boolean, nullable=False, default=False),
        Column("recorded_at", DateTime(timezone=True), nullable=False),
    )

    anomalies_table = Table(
        "road_anomalies", _metadata,
        Column("id", Integer, primary_key=True, autoincrement=True),
        Column("bus_id", String, nullable=False),
        Column("latitude", Float, nullable=False),
        Column("longitude", Float, nullable=False),
        Column("z_accel", Float, nullable=False),
        Column("recorded_at", DateTime(timezone=True), nullable=False),
        Column("is_anomaly", Boolean, nullable=False, default=True),
    )

    lane_states_table = Table(
        "lane_states", _metadata,
        Column("lane", String, primary_key=True),
        Column("vehicle_count", Integer, nullable=False, default=0),
        Column("pedestrian_count", Integer, nullable=False, default=0),
        Column("last_nonzero_vehicle_seen_at", DateTime(timezone=True), nullable=True),
    )

    emergency_overrides_table = Table(
        "emergency_overrides", _metadata,
        Column("intersection_id", String, primary_key=True),
        Column("vehicle_id", String, nullable=False),
        Column("vehicle_type", String, nullable=False),
        Column("mode", String, nullable=False),
        Column("cross_traffic_signal", String, nullable=False),
        Column("emergency_path_signal", String, nullable=False),
        Column("created_at", DateTime(timezone=True), nullable=False),
        Column("expires_at", DateTime(timezone=True), nullable=False),
    )

    pollution_zones_table = Table(
        "pollution_zones", _metadata,
        Column("zone_id", String, primary_key=True),
        Column("intersection_id", String, nullable=True),
        Column("aqi", Float, nullable=False),
        Column("pm25", Float, nullable=False),
        Column("no2", Float, nullable=False),
        Column("recorded_at", DateTime(timezone=True), nullable=False),
        Column("high_pollution", Boolean, nullable=False, default=False),
    )

    v2p_alerts_table = Table(
        "v2p_alerts", _metadata,
        Column("event_id", String, primary_key=True),
        Column("intersection_id", String, nullable=False),
        Column("camera_id", String, nullable=False),
        Column("latitude", Float, nullable=False),
        Column("longitude", Float, nullable=False),
        Column("danger_type", String, nullable=False),
        Column("severity", String, nullable=False),
        Column("detected_at", DateTime(timezone=True), nullable=False),
    )

except Exception:  # pragma: no cover
    pass  # DB unavailable — callers fall back to in-memory


async def create_tables() -> bool:
    if _engine is None or _metadata is None:
        return False
    try:
        async with _engine.begin() as conn:
            await conn.run_sync(_metadata.create_all)
        return True
    except Exception:
        return False


# ── Camera CRUD ───────────────────────────────────────────────────────────────

async def db_upsert_camera(cam: Dict[str, Any]) -> bool:
    if _engine is None or cameras_table is None:
        return False
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    try:
        async with _engine.begin() as conn:
            stmt = pg_insert(cameras_table).values(
                sensor_id=cam["sensor_id"], source=cam["source"],
                lane=cam["lane"], created_at=cam["created_at"],
            ).on_conflict_do_update(index_elements=["sensor_id"],
                                    set_={"source": cam["source"], "lane": cam["lane"]})
            await conn.execute(stmt)
        return True
    except Exception:
        return False


async def db_delete_camera(sensor_id: str) -> bool:
    if _engine is None or cameras_table is None:
        return False
    from sqlalchemy import delete
    try:
        async with _engine.begin() as conn:
            await conn.execute(delete(cameras_table).where(cameras_table.c.sensor_id == sensor_id))
        return True
    except Exception:
        return False


async def db_list_cameras() -> Optional[List[Dict[str, Any]]]:
    if _engine is None or cameras_table is None:
        return None
    from sqlalchemy import select
    try:
        async with _engine.connect() as conn:
            rows = await conn.execute(select(cameras_table).order_by(cameras_table.c.created_at))
            return [dict(r._mapping) for r in rows]
    except Exception:
        return None


# ── Parking CRUD ──────────────────────────────────────────────────────────────

async def db_upsert_parking(slot: Dict[str, Any]) -> bool:
    if _engine is None or parking_table is None:
        return False
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    try:
        async with _engine.begin() as conn:
            stmt = pg_insert(parking_table).values(**slot).on_conflict_do_update(
                index_elements=["slot_id"],
                set_={k: slot[k] for k in ("zone_id", "latitude", "longitude", "distance_from_entrance", "occupied", "recorded_at")},
            )
            await conn.execute(stmt)
        return True
    except Exception:
        return False


async def db_list_available_parking() -> Optional[List[Dict[str, Any]]]:
    if _engine is None or parking_table is None:
        return None
    from sqlalchemy import select
    try:
        async with _engine.connect() as conn:
            rows = await conn.execute(select(parking_table).where(parking_table.c.occupied == False))  # noqa: E712
            return [dict(r._mapping) for r in rows]
    except Exception:
        return None


# ── Road Anomalies ────────────────────────────────────────────────────────────

async def db_insert_anomaly(anomaly: Dict[str, Any]) -> bool:
    if _engine is None or anomalies_table is None:
        return False
    try:
        async with _engine.begin() as conn:
            await conn.execute(anomalies_table.insert().values(
                bus_id=anomaly["bus_id"], latitude=anomaly["latitude"],
                longitude=anomaly["longitude"], z_accel=anomaly["z_accel"],
                recorded_at=datetime.fromisoformat(anomaly["recorded_at"]),
                is_anomaly=anomaly["is_anomaly"],
            ))
        return True
    except Exception:
        return False


async def db_list_anomalies() -> Optional[List[Dict[str, Any]]]:
    if _engine is None or anomalies_table is None:
        return None
    from sqlalchemy import select
    try:
        async with _engine.connect() as conn:
            rows = await conn.execute(
                select(anomalies_table).where(anomalies_table.c.is_anomaly == True)  # noqa: E712
                .order_by(anomalies_table.c.recorded_at.desc()).limit(500)
            )
            return [
                {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in dict(r._mapping).items()}
                for r in rows
            ]
    except Exception:
        return None


# ── Lane States ───────────────────────────────────────────────────────────────

async def db_upsert_lane_state(lane: str, vehicle_count: int, pedestrian_count: int, last_seen: Optional[datetime] = None) -> bool:
    if _engine is None or 'lane_states_table' not in globals() or lane_states_table is None:
        return False
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    try:
        async with _engine.begin() as conn:
            stmt = pg_insert(lane_states_table).values(
                lane=lane, vehicle_count=vehicle_count, pedestrian_count=pedestrian_count,
                last_nonzero_vehicle_seen_at=last_seen
            ).on_conflict_do_update(
                index_elements=["lane"],
                set_={"vehicle_count": vehicle_count, "pedestrian_count": pedestrian_count, "last_nonzero_vehicle_seen_at": last_seen}
            )
            await conn.execute(stmt)
        return True
    except Exception:
        return False

async def db_list_lane_states() -> Optional[List[Dict[str, Any]]]:
    if _engine is None or 'lane_states_table' not in globals() or lane_states_table is None:
        return None
    from sqlalchemy import select
    try:
        async with _engine.connect() as conn:
            rows = await conn.execute(select(lane_states_table))
            return [dict(r._mapping) for r in rows]
    except Exception:
        return None


# ── Emergency Overrides ───────────────────────────────────────────────────────

async def db_upsert_emergency_override(override: Dict[str, Any]) -> bool:
    if _engine is None or 'emergency_overrides_table' not in globals() or emergency_overrides_table is None:
        return False
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    try:
        async with _engine.begin() as conn:
            stmt = pg_insert(emergency_overrides_table).values(
                intersection_id=override["intersection_id"], vehicle_id=override["vehicle_id"],
                vehicle_type=override["vehicle_type"], mode=override["mode"],
                cross_traffic_signal=override["cross_traffic_signal"],
                emergency_path_signal=override["emergency_path_signal"],
                created_at=datetime.fromisoformat(override["created_at"]) if isinstance(override["created_at"], str) else override["created_at"],
                expires_at=datetime.fromisoformat(override["expires_at"]) if isinstance(override["expires_at"], str) else override["expires_at"]
            ).on_conflict_do_update(
                index_elements=["intersection_id"],
                set_={"expires_at": datetime.fromisoformat(override["expires_at"]) if isinstance(override["expires_at"], str) else override["expires_at"]}
            )
            await conn.execute(stmt)
        return True
    except Exception:
        return False

async def db_list_emergency_overrides() -> Optional[List[Dict[str, Any]]]:
    if _engine is None or 'emergency_overrides_table' not in globals() or emergency_overrides_table is None:
        return None
    from sqlalchemy import select
    try:
        async with _engine.connect() as conn:
            rows = await conn.execute(select(emergency_overrides_table))
            return [{k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in dict(r._mapping).items()} for r in rows]
    except Exception:
        return None

async def db_delete_emergency_override(intersection_id: str) -> bool:
    if _engine is None or 'emergency_overrides_table' not in globals() or emergency_overrides_table is None:
        return False
    from sqlalchemy import delete
    try:
        async with _engine.begin() as conn:
            await conn.execute(delete(emergency_overrides_table).where(emergency_overrides_table.c.intersection_id == intersection_id))
        return True
    except Exception:
        return False


# ── Pollution Zones ───────────────────────────────────────────────────────────

async def db_upsert_pollution_zone(zone: Dict[str, Any]) -> bool:
    if _engine is None or 'pollution_zones_table' not in globals() or pollution_zones_table is None:
        return False
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    try:
        async with _engine.begin() as conn:
            stmt = pg_insert(pollution_zones_table).values(
                zone_id=zone["zone_id"], intersection_id=zone.get("intersection_id"),
                aqi=zone["aqi"], pm25=zone["pm25"], no2=zone["no2"],
                recorded_at=datetime.fromisoformat(zone["recorded_at"]) if isinstance(zone["recorded_at"], str) else zone["recorded_at"],
                high_pollution=zone["high_pollution"]
            ).on_conflict_do_update(
                index_elements=["zone_id"],
                set_={"aqi": zone["aqi"], "pm25": zone["pm25"], "no2": zone["no2"], "recorded_at": datetime.fromisoformat(zone["recorded_at"]) if isinstance(zone["recorded_at"], str) else zone["recorded_at"], "high_pollution": zone["high_pollution"]}
            )
            await conn.execute(stmt)
        return True
    except Exception:
        return False

async def db_list_high_pollution_zones() -> Optional[List[Dict[str, Any]]]:
    if _engine is None or 'pollution_zones_table' not in globals() or pollution_zones_table is None:
        return None
    from sqlalchemy import select
    try:
        async with _engine.connect() as conn:
            rows = await conn.execute(select(pollution_zones_table).where(pollution_zones_table.c.high_pollution == True))
            return [{k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in dict(r._mapping).items()} for r in rows]
    except Exception:
        return None


# ── V2P Alerts ────────────────────────────────────────────────────────────────

async def db_insert_v2p_alert(alert: Dict[str, Any]) -> bool:
    if _engine is None or 'v2p_alerts_table' not in globals() or v2p_alerts_table is None:
        return False
    try:
        async with _engine.begin() as conn:
            await conn.execute(v2p_alerts_table.insert().values(
                event_id=alert["event_id"], intersection_id=alert["intersection_id"],
                camera_id=alert["camera_id"], latitude=alert["latitude"],
                longitude=alert["longitude"], danger_type=alert["danger_type"],
                severity=alert["severity"], detected_at=datetime.fromisoformat(alert["detected_at"]) if isinstance(alert["detected_at"], str) else alert["detected_at"]
            ))
        return True
    except Exception:
        return False

async def db_list_v2p_alerts(limit: int = 20) -> Optional[List[Dict[str, Any]]]:
    if _engine is None or 'v2p_alerts_table' not in globals() or v2p_alerts_table is None:
        return None
    from sqlalchemy import select
    try:
        async with _engine.connect() as conn:
            rows = await conn.execute(select(v2p_alerts_table).order_by(v2p_alerts_table.c.detected_at.desc()).limit(limit))
            return [{k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in dict(r._mapping).items()} for r in rows]
    except Exception:
        return None
