import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Truck, Activity, AlertTriangle, CheckCircle, Wrench, Battery,
  Navigation, Search, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw,
  Power, Send, BellOff, TrendingUp
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────
interface GpsCoords { lat: number; lon: number; }

interface Vehicle {
  bus_id: string;
  route_id: string;
  gps_coordinates: GpsCoords;
  speed: number;
  passenger_count: number;
  is_late: boolean;
  operational_status: 'active' | 'maintenance' | 'offline';
}

type SortKey = 'bus_id' | 'speed' | 'passenger_count' | 'operational_status';
type SortDir = 'asc' | 'desc';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9000';

// ──────────────────────────────────────────────────────────────────────────────
// Seed fallback data (shown when backend is unreachable)
// ──────────────────────────────────────────────────────────────────────────────
const SEED_FLEET: Vehicle[] = [
  { bus_id: 'BUS-101', route_id: 'RTE-A', gps_coordinates: { lat: 22.308, lon: 73.1997 }, speed: 45, passenger_count: 25, is_late: false, operational_status: 'active' },
  { bus_id: 'BUS-102', route_id: 'RTE-B', gps_coordinates: { lat: 22.312, lon: 73.205 },  speed: 38, passenger_count: 38, is_late: false, operational_status: 'active' },
  { bus_id: 'BUS-103', route_id: 'RTE-A', gps_coordinates: { lat: 22.3005, lon: 73.189 }, speed: 0,  passenger_count: 0,  is_late: false, operational_status: 'maintenance' },
  { bus_id: 'BUS-104', route_id: 'RTE-C', gps_coordinates: { lat: 22.32, lon: 73.21 },    speed: 52, passenger_count: 50, is_late: true,  operational_status: 'active' },
  { bus_id: 'BUS-105', route_id: 'RTE-B', gps_coordinates: { lat: 22.298, lon: 73.22 },   speed: 0,  passenger_count: 0,  is_late: false, operational_status: 'offline' },
  { bus_id: 'BUS-106', route_id: 'RTE-D', gps_coordinates: { lat: 22.315, lon: 73.195 },  speed: 28, passenger_count: 12, is_late: false, operational_status: 'active' },
];

// ──────────────────────────────────────────────────────────────────────────────
// Simulated 24-hour trend data for the area chart
// ──────────────────────────────────────────────────────────────────────────────
const TREND_DATA = Array.from({ length: 24 }, (_, h) => ({
  hour: `${String(h).padStart(2, '0')}:00`,
  active: Math.round(3 + Math.sin(((h - 8) * Math.PI) / 12) * 2 + Math.random()),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Map helper: pan to selected vehicle
// ──────────────────────────────────────────────────────────────────────────────
function MapPanner({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 16, { duration: 1 });
  }, [target, map]);
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Custom bus icon factory
// ──────────────────────────────────────────────────────────────────────────────
function busIcon(status: Vehicle['operational_status'], selected: boolean) {
  const color = status === 'active' ? '#10b981' : status === 'maintenance' ? '#f59e0b' : '#94a3b8';
  const ring  = selected ? `box-shadow:0 0 0 3px ${color};` : '';
  return L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;${ring}border:2px solid rgba(255,255,255,0.8);">
             <svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='1' y='3' width='15' height='13'/><polygon points='16 8 20 8 23 11 23 16 16 16 16 8'/><circle cx='5.5' cy='18.5' r='2.5'/><circle cx='18.5' cy='18.5' r='2.5'/></svg>
           </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Status badge helper
// ──────────────────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Vehicle['operational_status'] }) {
  const config = {
    active:      { color: 'var(--accent-green)',  bg: 'rgba(16,185,129,0.12)',  icon: <CheckCircle size={12}/>, label: 'Active' },
    maintenance: { color: 'var(--accent-orange)', bg: 'rgba(245,158,11,0.12)',  icon: <Wrench size={12}/>,      label: 'Maintenance' },
    offline:     { color: 'var(--text-secondary)', bg: 'rgba(148,163,184,0.1)', icon: <AlertTriangle size={12}/>, label: 'Offline' },
  }[status];
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', fontSize:'12px', fontWeight:600,
                   color: config.color, background: config.bg, padding:'3px 10px', borderRadius:'20px' }}>
      {config.icon} {config.label}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────
export default function FleetManagement() {
  const [vehicles, setVehicles] = useState<Vehicle[]>(SEED_FLEET);
  const [loading, setLoading]   = useState(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [apiError, setApiError] = useState(false);

  // Filtering / searching / sorting
  const [filter, setFilter]   = useState<'all' | 'active' | 'maintenance' | 'offline'>('all');
  const [search, setSearch]   = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('bus_id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Map selection
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapTarget, setMapTarget]   = useState<[number, number] | null>(null);
  const markerRefs = useRef<Record<string, L.Marker>>({});

  // ── Fetch fleet data ────────────────────────────────────────────────────────
  const fetchFleet = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/fleet`);
      if (!res.ok) throw new Error('non-2xx');
      const data: Vehicle[] = await res.json();
      setVehicles(data);
      setApiError(false);
    } catch {
      setApiError(true);
      // Keep seed/previous data visible
    } finally {
      setLoading(false);
      setLastSync(new Date());
    }
  }, []);

  useEffect(() => {
    fetchFleet();
    const id = setInterval(fetchFleet, 10_000);
    return () => clearInterval(id);
  }, [fetchFleet]);

  // ── Action handler ─────────────────────────────────────────────────────────
  const handleAction = async (busId: string, action: 'maintenance' | 'active' | 'acknowledge') => {
    // Optimistic update
    setVehicles(prev => prev.map(v =>
      v.bus_id === busId
        ? { ...v, operational_status: action === 'acknowledge' ? v.operational_status : action }
        : v
    ));
    try {
      await fetch(`${API_BASE}/api/admin/fleet/${busId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
    } catch {
      // If it fails just re-fetch
      fetchFleet();
    }
  };

  // ── Select + pan map ───────────────────────────────────────────────────────
  const selectVehicle = (v: Vehicle) => {
    setSelectedId(v.bus_id);
    setMapTarget([v.gps_coordinates.lat, v.gps_coordinates.lon]);
    const marker = markerRefs.current[v.bus_id];
    if (marker) marker.openPopup();
  };

  // ── Sorting ────────────────────────────────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <ArrowUpDown size={13} style={{ opacity: 0.4 }}/> :
    sortDir === 'asc' ? <ArrowUp size={13}/> : <ArrowDown size={13}/>;

  // ── Derived list ───────────────────────────────────────────────────────────
  const displayed = vehicles
    .filter(v => (filter === 'all' || v.operational_status === filter))
    .filter(v => v.bus_id.toLowerCase().includes(search.toLowerCase()) ||
                 v.route_id.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number')
        return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

  // ── KPI counts ─────────────────────────────────────────────────────────────
  const activeCount      = vehicles.filter(v => v.operational_status === 'active').length;
  const maintenanceCount = vehicles.filter(v => v.operational_status === 'maintenance').length;
  const offlineCount     = vehicles.filter(v => v.operational_status === 'offline').length;
  const lateCount        = vehicles.filter(v => v.is_late).length;

  return (
    <div className="animate-fade-in" style={{ display:'flex', flexDirection:'column', gap:'24px' }}>

      {/* ── Header ── */}
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h2 style={{ margin:'0 0 6px', fontSize:'28px', display:'flex', alignItems:'center', gap:'12px' }}>
            <Truck color="var(--accent-orange)" size={32}/>
            Fleet Management
          </h2>
          <p style={{ margin:0, color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:'8px', fontSize:'14px' }}>
            <span className="pulse-dot"/>
            Live telemetry — last synced {lastSync.toLocaleTimeString()}
            {apiError && <span style={{ color:'var(--accent-orange)', fontSize:'12px', marginLeft:'8px' }}>⚠ using cached data</span>}
          </p>
        </div>
        <button onClick={fetchFleet} disabled={loading}
          style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', borderRadius:'12px',
                   border:'1px solid var(--panel-border)', background:'rgba(255,255,255,0.05)',
                   color:'white', cursor:'pointer', fontWeight:600, fontSize:'14px' }}>
          <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/>
          Refresh
        </button>
      </header>

      {/* ── KPI Cards ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px,1fr))', gap:'16px' }}>
        {[
          { label:'Total Fleet',     value: vehicles.length,  icon:<Truck size={20}/>,         color:'var(--accent-cyan)',   bg:'rgba(56,189,248,0.1)' },
          { label:'Active on Route', value: activeCount,       icon:<Activity size={20}/>,       color:'var(--accent-green)',  bg:'rgba(16,185,129,0.1)' },
          { label:'Maintenance',     value: maintenanceCount,  icon:<Wrench size={20}/>,         color:'var(--accent-orange)', bg:'rgba(245,158,11,0.1)' },
          { label:'Offline',         value: offlineCount,      icon:<Power size={20}/>,          color:'var(--text-secondary)',bg:'rgba(148,163,184,0.1)' },
          { label:'Running Late',    value: lateCount,         icon:<AlertTriangle size={20}/>,  color:'var(--accent-red)',    bg:'rgba(239,68,68,0.1)' },
        ].map(({ label, value, icon, color, bg }) => (
          <div key={label} className="glass hover-lift" style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'10px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <span style={{ color:'var(--text-secondary)', fontSize:'13px', fontWeight:600 }}>{label}</span>
              <div style={{ padding:'8px', background: bg, borderRadius:'8px', color }}>{icon}</div>
            </div>
            <div style={{ fontSize:'34px', fontWeight:700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Analytics Chart ── */}
      <div className="glass" style={{ padding:'24px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}>
          <TrendingUp color="var(--accent-cyan)" size={20}/>
          <h3 style={{ margin:0, fontSize:'17px' }}>Active Vehicles — 24-Hour Trend</h3>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={TREND_DATA} margin={{ top:4, right:8, left:-20, bottom:0 }}>
            <defs>
              <linearGradient id="fleetGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#38bdf8" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
            <XAxis dataKey="hour" tick={{ fill:'#94a3b8', fontSize:11 }} tickLine={false} axisLine={false} interval={3}/>
            <YAxis tick={{ fill:'#94a3b8', fontSize:11 }} tickLine={false} axisLine={false}/>
            <Tooltip contentStyle={{ background:'#1e293b', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'white' }} labelStyle={{ color:'#94a3b8' }}/>
            <Area type="monotone" dataKey="active" stroke="#38bdf8" strokeWidth={2} fill="url(#fleetGrad)"/>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Live Map ── */}
      <div className="glass" style={{ padding:'20px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'14px' }}>
          <Navigation color="var(--accent-green)" size={20}/>
          <h3 style={{ margin:0, fontSize:'17px' }}>Live Vehicle Tracking</h3>
          <span style={{ fontSize:'12px', color:'var(--text-secondary)', marginLeft:'auto' }}>Click a row to pan map</span>
        </div>
        <div style={{ height:'340px', borderRadius:'12px', overflow:'hidden' }}>
          <MapContainer center={[22.305, 73.2]} zoom={13} style={{ height:'100%', width:'100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            <MapPanner target={mapTarget}/>
            {vehicles.map(v => (
              <Marker
                key={v.bus_id}
                position={[v.gps_coordinates.lat, v.gps_coordinates.lon]}
                icon={busIcon(v.operational_status, v.bus_id === selectedId)}
                ref={el => { if (el) markerRefs.current[v.bus_id] = el; }}
              >
                <Popup>
                  <div style={{ lineHeight:'1.6' }}>
                    <strong>{v.bus_id}</strong><br/>
                    Route: {v.route_id}<br/>
                    Speed: {v.speed} km/h<br/>
                    Passengers: {v.passenger_count}<br/>
                    Status: {v.operational_status}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* ── Vehicle List ── */}
      <div className="glass" style={{ padding:'24px' }}>
        {/* Controls row */}
        <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', marginBottom:'20px', alignItems:'center' }}>
          <h3 style={{ margin:0, fontSize:'17px', flex:'0 0 auto' }}>Vehicle Status</h3>

          {/* Search */}
          <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'rgba(15,23,42,0.5)',
                        border:'1px solid var(--panel-border)', borderRadius:'10px', padding:'8px 14px', flex:'1 1 200px' }}>
            <Search size={15} color="var(--text-secondary)"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search ID or route…"
              style={{ background:'transparent', border:'none', outline:'none', color:'white', fontSize:'14px', width:'100%' }}/>
          </div>

          {/* Status filter */}
          <div className="glass" style={{ display:'flex', gap:'6px', padding:'6px', borderRadius:'10px' }}>
            {(['all','active','maintenance','offline'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding:'6px 14px', borderRadius:'8px', border:'none', fontWeight:600, fontSize:'13px', cursor:'pointer',
                         background: filter === f ? 'var(--accent-orange)' : 'transparent',
                         color: filter === f ? '#0f172a' : 'white', textTransform:'capitalize', transition:'all 0.2s' }}>
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1fr 1fr 1fr 2fr',
                      padding:'8px 16px', marginBottom:'8px', fontSize:'12px',
                      color:'var(--text-secondary)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>
          {([
            { key:'bus_id' as SortKey,              label:'Vehicle'  },
            { key:'route_id' as SortKey,             label:'Route'    },
            { key:'speed' as SortKey,                label:'Speed'    },
            { key:'passenger_count' as SortKey,      label:'Pax'      },
            { key:'operational_status' as SortKey,   label:'Status'   },
            { key: null,                             label:'Actions'  },
          ] as { key: SortKey | null; label: string }[]).map(({ key, label }, i) => (
            <div key={i} className={key ? 'sort-th' : ''} onClick={() => key && toggleSort(key)}
                 style={{ display:'flex', alignItems:'center', gap:'5px' }}>
              {label}
              {key && <SortIcon k={key}/>}
            </div>
          ))}
        </div>


        {/* Rows */}
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {displayed.map(v => {
            const isSelected = v.bus_id === selectedId;
            return (
              <div key={v.bus_id} onClick={() => selectVehicle(v)} className="hover-lift"
                style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1fr 1fr 1fr 2fr',
                         alignItems:'center', padding:'14px 16px',
                         background: isSelected ? 'rgba(56,189,248,0.07)' : 'rgba(15,23,42,0.4)',
                         borderRadius:'12px', border: `1px solid ${isSelected ? 'rgba(56,189,248,0.3)' : 'var(--panel-border)'}`,
                         cursor:'pointer', transition:'all 0.2s' }}>

                {/* Vehicle ID */}
                <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                  <div style={{ width:'40px', height:'40px', borderRadius:'10px',
                                background:'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Truck size={20} color={
                      v.operational_status === 'active' ? 'var(--accent-green)' :
                      v.operational_status === 'maintenance' ? 'var(--accent-orange)' : 'var(--text-secondary)'}/>
                  </div>
                  <div>
                    <div style={{ fontWeight:700 }}>{v.bus_id}</div>
                    {v.is_late && <div style={{ fontSize:'11px', color:'var(--accent-red)', fontWeight:600 }}>⚠ Running Late</div>}
                  </div>
                </div>

                {/* Route */}
                <div style={{ display:'flex', alignItems:'center', gap:'6px', color:'var(--text-secondary)', fontSize:'14px' }}>
                  <Navigation size={14}/> {v.route_id}
                </div>

                {/* Speed */}
                <div style={{ fontWeight:600 }}>
                  {v.speed} <span style={{ fontSize:'12px', color:'var(--text-secondary)', fontWeight:400 }}>km/h</span>
                </div>

                {/* Passengers */}
                <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                  <Battery size={16} color={v.passenger_count > 40 ? 'var(--accent-red)' : 'var(--accent-green)'}/>
                  <span style={{ fontWeight:600 }}>{v.passenger_count}</span>
                </div>

                {/* Status badge */}
                <div><StatusBadge status={v.operational_status}/></div>

                {/* Action buttons */}
                <div style={{ display:'flex', gap:'6px', justifyContent:'flex-end' }} onClick={e => e.stopPropagation()}>
                  {v.operational_status !== 'maintenance' && (
                    <button onClick={() => handleAction(v.bus_id, 'maintenance')}
                      title="Mark for Maintenance"
                      style={{ padding:'7px 12px', borderRadius:'8px', border:'none', cursor:'pointer', fontSize:'12px', fontWeight:600,
                               background:'rgba(245,158,11,0.1)', color:'var(--accent-orange)', display:'flex', alignItems:'center', gap:'5px' }}>
                      <Wrench size={13}/> Maintenance
                    </button>
                  )}
                  {v.operational_status === 'maintenance' && (
                    <button onClick={() => handleAction(v.bus_id, 'active')}
                      title="Return to service"
                      style={{ padding:'7px 12px', borderRadius:'8px', border:'none', cursor:'pointer', fontSize:'12px', fontWeight:600,
                               background:'rgba(16,185,129,0.1)', color:'var(--accent-green)', display:'flex', alignItems:'center', gap:'5px' }}>
                      <Send size={13}/> Dispatch
                    </button>
                  )}
                  {v.is_late && (
                    <button onClick={() => handleAction(v.bus_id, 'acknowledge')}
                      title="Acknowledge late alert"
                      style={{ padding:'7px 12px', borderRadius:'8px', border:'none', cursor:'pointer', fontSize:'12px', fontWeight:600,
                               background:'rgba(239,68,68,0.1)', color:'var(--accent-red)', display:'flex', alignItems:'center', gap:'5px' }}>
                      <BellOff size={13}/> Acknowledge
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {displayed.length === 0 && (
            <div style={{ textAlign:'center', padding:'48px', color:'var(--text-secondary)' }}>
              <Truck size={48} style={{ opacity:0.3, marginBottom:'12px' }}/>
              <div>No vehicles match the current filters.</div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
