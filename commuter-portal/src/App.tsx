import React, { useEffect, useMemo, useRef, useState, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { Bus, Car, Wind, AlertTriangle, RefreshCw, MapPin, Clock, Bell, X, Wifi, WifiOff, ChevronDown } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './index.css';

// Fix leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9000';
const AUTO_REFRESH_INTERVAL = 30;

// ── Types ──────────────────────────────────────────────────────────────────────
type BusItem = {
  bus_id: string;
  occupancy_status?: string;
  speed?: number;
  is_late?: boolean;
  gps_coordinates?: { lat?: number; lon?: number; latitude?: number; longitude?: number };
};
type ParkingItem = { slot_id: string; zone_id: string; distance_m?: number; latitude?: number; longitude?: number };
type PollutionItem = { zone_id: string; aqi?: number; pm25?: number; high_pollution?: boolean };
type CommuterResponse = {
  route_id: string;
  bus_tracking?: { buses?: BusItem[] };
  smart_parking?: { count?: number; items?: ParkingItem[] };
  air_quality?: { count?: number; items?: PollutionItem[] };
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function seatLabel(s?: string) { return s === 'EMPTY' ? 'Empty' : s === 'MODERATE' ? 'Moderate' : s === 'FULL' ? 'Full' : 'Unknown'; }
function seatColor(s?: string) { return s === 'EMPTY' ? 'var(--accent-green)' : s === 'MODERATE' ? 'var(--accent-orange)' : s === 'FULL' ? 'var(--accent-red)' : 'var(--text-secondary)'; }
function getAqiColor(aqi?: number) {
  if (!aqi) return 'var(--text-secondary)';
  if (aqi < 50) return '#10b981';
  if (aqi < 100) return '#f59e0b';
  if (aqi < 150) return '#f97316';
  if (aqi < 200) return '#ef4444';
  return '#7c3aed';
}
function getAqiLabel(aqi?: number) {
  if (!aqi) return 'No Data';
  if (aqi < 50) return 'Good'; if (aqi < 100) return 'Moderate';
  if (aqi < 150) return 'Unhealthy for Sensitive Groups';
  if (aqi < 200) return 'Unhealthy'; if (aqi < 300) return 'Very Unhealthy';
  return 'Hazardous';
}
function getAqiAdvice(aqi?: number) {
  if (!aqi) return 'No air quality data available.';
  if (aqi < 50) return '✅ Air quality is good. Safe for all outdoor activities.';
  if (aqi < 100) return '😷 Acceptable air quality. Sensitive groups should limit prolonged exertion.';
  if (aqi < 150) return '⚠️ Unhealthy for sensitive groups. Consider reducing outdoor activity.';
  if (aqi < 200) return '🚫 Unhealthy. Everyone should reduce prolonged outdoor exposure.';
  return '☠️ Hazardous conditions. Avoid all outdoor activity.';
}
function getPollCircleColor(aqi?: number) {
  if (!aqi) return '#94a3b8';
  if (aqi < 50) return '#10b981'; if (aqi < 100) return '#f59e0b';
  if (aqi < 150) return '#f97316'; return '#ef4444';
}

// ── AQI Gauge ──────────────────────────────────────────────────────────────────
function AqiGauge({ aqi }: { aqi?: number }) {
  const val = Math.min(aqi ?? 0, 300);
  const r = 52; const circ = 2 * Math.PI * r; const arc = circ * 0.75;
  const filled = (val / 300) * arc;
  const color = getAqiColor(aqi);
  return (
    <div style={{ position: 'relative', width: 140, height: 110, margin: '0 auto' }}>
      <svg width="140" height="110" viewBox="0 0 140 110">
        <circle cx="70" cy="78" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="11"
          strokeDasharray={`${arc} ${circ - arc}`} strokeLinecap="round" transform="rotate(-225 70 78)" />
        <circle cx="70" cy="78" r={r} fill="none" stroke={color} strokeWidth="11"
          strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" transform="rotate(-225 70 78)"
          style={{ transition: 'all 0.8s ease' }} />
      </svg>
      <div style={{ position: 'absolute', top: '52%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
        <div style={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1 }}>{aqi ?? '--'}</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>AQI</div>
      </div>
    </div>
  );
}

function busEta(bus: BusItem, userLat: number, userLon: number): string {
  const lat = bus.gps_coordinates?.lat ?? bus.gps_coordinates?.latitude;
  const lon = bus.gps_coordinates?.lon ?? bus.gps_coordinates?.longitude;
  if (!lat || !lon) return 'N/A';
  const dist = Math.sqrt(Math.pow((lat - userLat) * 111000, 2) + Math.pow((lon - userLon) * 111000 * Math.cos(userLat * Math.PI / 180), 2));
  const speed = (bus.speed ?? 30);
  if (speed < 0.5) return 'Stationary';
  const etaMins = Math.round((dist / (speed / 3.6)) / 60);
  if (etaMins < 1) return '< 1 min';
  return `~${etaMins} min`;
}

function busIcon(late: boolean) {
  return L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${late ? '#ef4444' : '#10b981'};display:flex;align-items:center;justify-content:center;border:2px solid white;">
             <svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='1' y='3' width='15' height='13'/><polygon points='16 8 20 8 23 11 23 16 16 16 16 8'/><circle cx='5.5' cy='18.5' r='2.5'/><circle cx='18.5' cy='18.5' r='2.5'/></svg>
           </div>`,
    iconSize: [26, 26], iconAnchor: [13, 13],
  });
}

// ── Alert Banner ───────────────────────────────────────────────────────────────
function AlertBanner({ buses, pollution }: { buses: BusItem[]; pollution: PollutionItem[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const lateBuses = buses.filter(b => b.is_late);
  const highPollution = pollution.filter(p => p.high_pollution);
  const alerts = [
    ...lateBuses.map(b => ({ id: `bus-${b.bus_id}`, type: 'warning' as const, msg: `Bus ${b.bus_id} is running late on this route.` })),
    ...highPollution.map(p => ({ id: `pol-${p.zone_id}`, type: 'danger' as const, msg: `High pollution in Zone ${p.zone_id} — AQI: ${p.aqi}. Consider public transit.` })),
  ].filter(a => !dismissed.includes(a.id));

  if (alerts.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {alerts.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '12px',
                                  background: a.type === 'danger' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                                  border: `1px solid ${a.type === 'danger' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
          <AlertTriangle size={16} color={a.type === 'danger' ? 'var(--accent-red)' : 'var(--accent-orange)'} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{a.msg}</span>
          <button onClick={() => setDismissed(d => [...d, a.id])}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Error Boundary ────────────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-primary)', fontFamily: 'sans-serif' }}>
          <AlertTriangle size={64} color="var(--accent-red)" style={{ marginBottom: '16px' }} />
          <h2 style={{ marginBottom: '10px' }}>Something went wrong.</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>{this.state.error?.message || "An unexpected error occurred in the Commuter Portal."}</p>
          <button onClick={() => window.location.reload()} style={{ padding: '12px 24px', background: 'var(--accent-cyan)', color: '#0f172a', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Main Component ──────────────────────────────────────────────────────────────
function CommuterApp() {
  const [routeId, setRouteId]         = useState('RTE-A');
  const [availableRoutes, setAvailableRoutes] = useState<string[]>([]);
  const [latitude, setLatitude]       = useState('22.3000');
  const [longitude, setLongitude]     = useState('73.2000');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [data, setData]               = useState<CommuterResponse | null>(null);
  const [refreshDelay, setRefreshDelay] = useState(AUTO_REFRESH_INTERVAL);
  const [countdown, setCountdown]     = useState(AUTO_REFRESH_INTERVAL);
  const countdownRef                  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync route list from admin fleet data
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/public/routes`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (Array.isArray(d.routes) && d.routes.length) setAvailableRoutes(d.routes); })
      .catch(() => {});
  }, []);

  const hasHighPollution = useMemo(() => Boolean(data?.air_quality?.items?.some(i => i.high_pollution)), [data]);
  const avgAqi = useMemo(() => {
    const items = data?.air_quality?.items ?? [];
    if (!items.length) return undefined;
    return Math.round(items.reduce((a, z) => a + (z.aqi ?? 0), 0) / items.length);
  }, [data]);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const q = new URLSearchParams({ route_id: routeId, latitude, longitude });
      const res = await fetch(`${API_BASE_URL}/api/public/commuter?${q}`);
      if (!res.ok) throw new Error(`Gateway error (${res.status})`);
      setData(await res.json());
      setRefreshDelay(AUTO_REFRESH_INTERVAL);
      setCountdown(AUTO_REFRESH_INTERVAL);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      const newDelay = Math.min(Math.round(refreshDelay * 1.5), 300); // Backoff up to 5 minutes
      setRefreshDelay(newDelay);
      setCountdown(newDelay);
    } finally {
      setLoading(false);
    }
  }, [routeId, latitude, longitude, refreshDelay]);

  // Initial load
  useEffect(() => { void loadData(); }, []);

  // Auto-refresh countdown
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { void loadData(); return refreshDelay; }
        return c - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [loadData]);

  const userLat = parseFloat(latitude) || 22.3;
  const userLon = parseFloat(longitude) || 73.2;
  const buses   = data?.bus_tracking?.buses ?? [];
  const parking = data?.smart_parking?.items ?? [];
  const pollution = data?.air_quality?.items ?? [];

  return (
    <>
      <div className="blob blob-1" />
      <div className="blob blob-2" />

      {/* Header */}
      <header className="glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderBottom: '1px solid var(--panel-border)', zIndex: 10, position: 'sticky', top: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Wind color="var(--accent-cyan)" size={26} />
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Synapse<span style={{ color: 'var(--accent-cyan)' }}>City</span></h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <Clock size={14} /> Auto-refresh in {countdown}s
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '20px',
                        background: error ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                        border: `1px solid ${error ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}` }}>
            {error ? <WifiOff size={14} color="var(--accent-red)" /> : <Wifi size={14} color="var(--accent-green)" />}
            <span style={{ fontSize: '12px', fontWeight: 600, color: error ? 'var(--accent-red)' : 'var(--accent-green)' }}>
              {error ? 'Offline' : 'Online'}
            </span>
          </div>
        </div>
      </header>

      <main style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }} className="animate-fade-in">

        {/* Alert Banners */}
        <AlertBanner buses={buses} pollution={pollution} />

        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* Sidebar */}
          <aside style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="glass" style={{ padding: '20px' }}>
              <h2 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={16} color="var(--accent-cyan)" /> Your Journey
              </h2>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Route</label>
                {availableRoutes.length > 0 ? (
                  <div style={{ position: 'relative' }}>
                    <select value={routeId} onChange={e => setRouteId(e.target.value)}
                      style={{ width: '100%', padding: '10px 36px 10px 12px', borderRadius: '10px', border: '1px solid var(--panel-border)', background: 'rgba(15,23,42,0.6)', color: 'white', outline: 'none', fontSize: '14px', appearance: 'none', cursor: 'pointer' }}>
                      {availableRoutes.map(r => <option key={r} value={r} style={{ background: '#1e293b' }}>{r}</option>)}
                    </select>
                    <ChevronDown size={14} color="var(--text-secondary)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                ) : (
                  <input value={routeId} onChange={e => setRouteId(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid var(--panel-border)', background: 'rgba(15,23,42,0.6)', color: 'white', outline: 'none', fontSize: '14px' }} />
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                {[['Latitude', latitude, setLatitude], ['Longitude', longitude, setLongitude]].map(([label, val, setter]) => (
                  <div key={label as string} style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>{label as string}</label>
                    <input value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid var(--panel-border)', background: 'rgba(15,23,42,0.6)', color: 'white', outline: 'none', fontSize: '13px' }} />
                  </div>
                ))}
              </div>
              <button onClick={() => { void loadData(); }} disabled={loading}
                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: 'var(--accent-cyan)', color: '#0f172a', fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                {loading ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={16} />}
                Refresh Now
              </button>
              {error && <div style={{ marginTop: '10px', padding: '10px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: 'var(--accent-red)', fontSize: '13px', textAlign: 'center' }}>{error}</div>}
            </div>

            {/* Quick stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { label: 'Active Buses', value: buses.length, color: 'var(--accent-cyan)' },
                { label: 'Late Buses',   value: buses.filter(b => b.is_late).length, color: buses.some(b => b.is_late) ? 'var(--accent-red)' : 'var(--accent-green)' },
                { label: 'Parking Spots',value: parking.length, color: 'var(--accent-green)' },
                { label: 'Avg AQI',      value: avgAqi ?? '--', color: getAqiColor(avgAqi) },
              ].map(({ label, value, color }) => (
                <div key={label} className="glass" style={{ padding: '14px', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 6px', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>{label}</p>
                  <p style={{ margin: 0, fontSize: '26px', fontWeight: 800, color }}>{value}</p>
                </div>
              ))}
            </div>

            {/* AQI Panel */}
            <div className="glass" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Wind size={18} color={hasHighPollution ? '#ef4444' : 'var(--accent-cyan)'} />
                <h3 style={{ margin: 0, fontSize: '15px' }}>Air Quality Index</h3>
                {hasHighPollution && <Bell size={14} color="#ef4444" />}
              </div>
              {/* Gauge */}
              <AqiGauge aqi={avgAqi} />
              {/* Label badge */}
              <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, padding: '4px 14px', borderRadius: '20px',
                               background: `${getAqiColor(avgAqi)}22`, color: getAqiColor(avgAqi) }}>
                  {getAqiLabel(avgAqi)}
                </span>
              </div>
              {/* Health advice */}
              <div style={{ padding: '10px 14px', borderRadius: '10px', marginBottom: '12px',
                            background: hasHighPollution ? 'rgba(239,68,68,0.08)' : 'rgba(56,189,248,0.06)',
                            border: `1px solid ${hasHighPollution ? 'rgba(239,68,68,0.2)' : 'rgba(56,189,248,0.15)'}`,
                            fontSize: '12px', lineHeight: 1.6 }}>
                {getAqiAdvice(avgAqi)}
              </div>
              {/* AQI Scale legend */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Scale</div>
                {[['0–50','#10b981','Good'],['51–100','#f59e0b','Moderate'],['101–150','#f97316','Unhealthy*'],['151–200','#ef4444','Unhealthy'],['201+','#7c3aed','Very Unhealthy']].map(([range,color,label]) => (
                  <div key={range} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', marginBottom: '3px' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '2px', background: color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-secondary)', minWidth: 50 }}>{range}</span>
                    <span style={{ color, fontWeight: 600 }}>{label}</span>
                  </div>
                ))}
              </div>
              {/* Per-zone breakdown */}
              {pollution.map(z => (
                <div key={z.zone_id} style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '10px', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700 }}>Zone {z.zone_id}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: getAqiColor(z.aqi) }}>AQI {z.aqi ?? '--'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    {(z as any).pm25 != null && <span>PM2.5: <strong style={{ color: 'var(--text-primary)' }}>{(z as any).pm25} μg/m³</strong></span>}
                    {(z as any).no2  != null && <span>NO₂: <strong style={{ color: 'var(--text-primary)' }}>{(z as any).no2} μg/m³</strong></span>}
                  </div>
                  <div style={{ height: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100,((z.aqi??0)/300)*100)}%`, height: '100%', background: getAqiColor(z.aqi), borderRadius: '4px', transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              ))}
              {pollution.length === 0 && <p style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', margin: '8px 0 0' }}>No pollution data.</p>}
            </div>
          </aside>

          {/* Main Content */}
          <section style={{ flex: '2 1 620px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Mini Map */}
            <div className="glass" style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin color="var(--accent-cyan)" size={18} /> Live Map — Route {routeId}
              </h3>
              <div style={{ height: '280px', borderRadius: '12px', overflow: 'hidden' }}>
                <MapContainer center={[userLat, userLon]} zoom={13} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  />
                  {/* User location circle */}
                  <Circle center={[userLat, userLon]} radius={200} pathOptions={{ color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.15 }}>
                    <Popup>Your Location</Popup>
                  </Circle>
                  {/* Bus markers */}
                  {buses.map(b => {
                    const lat = b.gps_coordinates?.lat ?? b.gps_coordinates?.latitude;
                    const lon = b.gps_coordinates?.lon ?? b.gps_coordinates?.longitude;
                    if (!lat || !lon) return null;
                    return (
                      <Marker key={b.bus_id} position={[lat, lon]} icon={busIcon(!!b.is_late)}>
                        <Popup>
                          <strong>Bus {b.bus_id}</strong><br />
                          ETA: {busEta(b, userLat, userLon)}<br />
                          Occupancy: {seatLabel(b.occupancy_status)}<br />
                          {b.is_late && <span style={{ color: '#ef4444', fontWeight: 700 }}>⚠ Running Late</span>}
                        </Popup>
                      </Marker>
                    );
                  })}
                  {/* Parking circles */}
                  {parking.map(p => p.latitude && p.longitude ? (
                    <Circle key={p.slot_id} center={[p.latitude, p.longitude]} radius={60} pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.35 }}>
                      <Popup>Parking Slot {p.slot_id} — {p.distance_m}m away</Popup>
                    </Circle>
                  ) : null)}
                  {/* Pollution zone circles */}
                  {pollution.map(z => {
                    const lat = (z as any).latitude;
                    const lon = (z as any).longitude;
                    if (!lat || !lon) return null;
                    const col = getPollCircleColor(z.aqi);
                    return (
                      <Circle key={`poll-${z.zone_id}`} center={[lat, lon]} radius={400}
                        pathOptions={{ color: col, fillColor: col, fillOpacity: 0.15, dashArray: '6 4' }}>
                        <Popup>
                          <strong>Zone {z.zone_id}</strong><br />
                          AQI: {z.aqi ?? '--'} — {getAqiLabel(z.aqi)}<br />
                          {(z as any).pm25 != null && <>PM2.5: {(z as any).pm25} μg/m³<br /></>}
                          {(z as any).no2  != null && <>NO₂: {(z as any).no2} μg/m³</>}
                        </Popup>
                      </Circle>
                    );
                  })}
                </MapContainer>
              </div>
            </div>

            {/* Transit + Parking cards */}
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {/* Transit */}
              <div className="glass" style={{ flex: '1 1 260px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Bus size={18} color="var(--accent-cyan)" /><h3 style={{ margin: 0, fontSize: '16px' }}>Live Transit</h3></div>
                  <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>Route {routeId}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {buses.map(bus => (
                    <div key={bus.bus_id} style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: '12px', border: bus.is_late ? '1px solid rgba(239,68,68,0.2)' : '1px solid transparent' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 700 }}>Bus {bus.bus_id}</span>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                                       background: `${seatColor(bus.occupancy_status)}22`, color: seatColor(bus.occupancy_status) }}>
                          {seatLabel(bus.occupancy_status)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} /> ETA: <span style={{ color: bus.is_late ? 'var(--accent-red)' : 'var(--accent-cyan)', fontWeight: 600 }}>
                            {busEta(bus, userLat, userLon)}
                          </span>
                        </span>
                        {bus.is_late && <span style={{ color: 'var(--accent-red)', fontSize: '11px', fontWeight: 700 }}>LATE</span>}
                      </div>
                    </div>
                  ))}
                  {!loading && buses.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '16px 0' }}>No active buses on this route.</p>}
                </div>
              </div>

              {/* Parking */}
              <div className="glass" style={{ flex: '1 1 260px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Car size={18} color="var(--accent-green)" /><h3 style={{ margin: 0, fontSize: '16px' }}>Smart Parking</h3></div>
                  <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>{parking.length} Available</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {parking.map(slot => (
                    <div key={slot.slot_id} style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 700 }}>Slot {slot.slot_id}</span>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-green)' }}>Available</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <span>Zone: {slot.zone_id}</span>
                        <span>{slot.distance_m != null ? `${Math.round(slot.distance_m)}m away` : '—'}</span>
                      </div>
                    </div>
                  ))}
                  {!loading && parking.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '16px 0' }}>No available parking nearby.</p>}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <CommuterApp />
    </ErrorBoundary>
  );
}
