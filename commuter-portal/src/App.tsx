import { useEffect, useMemo, useState } from "react";
import { Bus, Car, Wind, AlertTriangle, RefreshCw } from "lucide-react";
import "./index.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:9000";
const DEFAULT_ROUTE_ID = "R1";
const DEFAULT_LATITUDE = "22.3000";
const DEFAULT_LONGITUDE = "73.2000";

type BusItem = { bus_id: string; occupancy_status?: string; gps_coordinates?: { latitude?: number; longitude?: number; }; };
type ParkingItem = { slot_id: string; zone_id: string; distance_m?: number; };
type PollutionItem = { zone_id: string; aqi?: number; high_pollution?: boolean; };
type CommuterResponse = { route_id: string; bus_tracking?: { buses?: BusItem[]; }; smart_parking?: { count?: number; items?: ParkingItem[]; }; air_quality?: { count?: number; items?: PollutionItem[]; }; };

function seatLabel(status?: string): string {
  if (status === "EMPTY") return "Empty";
  if (status === "MODERATE") return "Moderate";
  if (status === "FULL") return "Full";
  return "Unknown";
}

function getAqiColor(aqi?: number): string {
  if (!aqi) return "var(--text-secondary)";
  if (aqi < 50) return "var(--accent-green)";
  if (aqi < 100) return "var(--accent-orange)";
  return "var(--accent-red)";
}

export default function App() {
  const [routeId, setRouteId] = useState(DEFAULT_ROUTE_ID);
  const [latitude, setLatitude] = useState(DEFAULT_LATITUDE);
  const [longitude, setLongitude] = useState(DEFAULT_LONGITUDE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CommuterResponse | null>(null);

  const hasHighPollution = useMemo(
    () => Boolean(data?.air_quality?.items?.some((item) => item.high_pollution)),
    [data]
  );

  const avgAqi = useMemo(() => {
    const items = data?.air_quality?.items ?? [];
    if (items.length === 0) return "--";
    const sum = items.reduce((acc, z) => acc + (z.aqi ?? 0), 0);
    return Math.round(sum / items.length).toString();
  }, [data]);

  const loadCommuterData = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ route_id: routeId, latitude, longitude });
      const response = await fetch(`${API_BASE_URL}/api/public/commuter?${query.toString()}`);
      if (!response.ok) throw new Error(`Gateway request failed (${response.status})`);
      const payload = (await response.json()) as CommuterResponse;
      setData(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCommuterData();
  }, []);

  return (
    <>
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--panel-border)', zIndex: 10 }} className="glass">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Wind color="var(--accent-cyan)" size={28} />
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Synapse<span style={{ color: 'var(--accent-cyan)' }}>City</span></h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '20px', background: error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', border: error ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: error ? 'var(--accent-red)' : 'var(--accent-green)', boxShadow: error ? '0 0 8px var(--accent-red)' : '0 0 8px var(--accent-green)' }}></div>
          <span style={{ fontSize: '12px', fontWeight: 600, color: error ? 'var(--accent-red)' : 'var(--accent-green)' }}>{error ? "Offline" : "Online"}</span>
        </div>
      </header>

      <main style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', display: 'flex', gap: '24px', flexWrap: 'wrap' }} className="animate-fade-in">
        
        {/* Sidebar Controls */}
        <aside style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="glass" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold' }}>A</div>
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Welcome, Commuter</h2>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Loc: {latitude}, {longitude}</p>
              </div>
            </div>
          </div>

          <div className="glass" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>Controls</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Route Identifier</label>
              <input value={routeId} onChange={e => setRouteId(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--panel-border)', background: 'rgba(15, 23, 42, 0.6)', color: 'white', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Latitude</label>
                <input value={latitude} onChange={e => setLatitude(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--panel-border)', background: 'rgba(15, 23, 42, 0.6)', color: 'white', outline: 'none' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Longitude</label>
                <input value={longitude} onChange={e => setLongitude(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--panel-border)', background: 'rgba(15, 23, 42, 0.6)', color: 'white', outline: 'none' }} />
              </div>
            </div>
            <button onClick={loadCommuterData} disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: 'var(--accent-cyan)', color: '#0f172a', fontWeight: 700, fontSize: '15px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
              {loading ? <RefreshCw className="animate-spin" size={18} /> : "Refresh Dashboard"}
            </button>
            {error && <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)', fontSize: '14px', textAlign: 'center' }}>{error}</div>}
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="glass interactive-card" style={{ flex: 1, padding: '16px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Active Buses</p>
              <p style={{ margin: '8px 0 0', fontSize: '28px', fontWeight: 800, color: 'var(--accent-cyan)' }}>{data?.bus_tracking?.buses?.length ?? 0}</p>
            </div>
            <div className="glass interactive-card" style={{ flex: 1, padding: '16px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Parking Spots</p>
              <p style={{ margin: '8px 0 0', fontSize: '28px', fontWeight: 800, color: 'var(--accent-green)' }}>{data?.smart_parking?.items?.length ?? 0}</p>
            </div>
          </div>
        </aside>

        {/* Dashboard Content */}
        <section style={{ flex: '2 1 600px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {/* Transit Card */}
            <div className="glass" style={{ flex: '1 1 280px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Bus size={20} color="var(--accent-cyan)" /><h3 style={{ margin: 0, fontSize: '18px' }}>Live Transit</h3></div>
                <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>Real-time</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(data?.bus_tracking?.buses ?? []).map(bus => (
                  <div key={bus.bus_id} className="interactive-card" style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 600 }}>Bus {bus.bus_id}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', background: bus.occupancy_status === 'EMPTY' ? 'rgba(16, 185, 129, 0.1)' : bus.occupancy_status === 'MODERATE' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: bus.occupancy_status === 'EMPTY' ? 'var(--accent-green)' : bus.occupancy_status === 'MODERATE' ? 'var(--accent-orange)' : 'var(--accent-red)' }}>{seatLabel(bus.occupancy_status)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <span>ETA: <span style={{ color: 'var(--accent-cyan)' }}>Live</span></span>
                      <span>Lat: {bus.gps_coordinates?.latitude?.toFixed(4) ?? "-"}</span>
                    </div>
                  </div>
                ))}
                {!loading && (data?.bus_tracking?.buses?.length ?? 0) === 0 && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '20px 0' }}>No active buses on this route.</p>}
              </div>
            </div>

            {/* Parking Card */}
            <div className="glass" style={{ flex: '1 1 280px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Car size={20} color="var(--accent-green)" /><h3 style={{ margin: 0, fontSize: '18px' }}>Smart Parking</h3></div>
                <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>Nearby</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(data?.smart_parking?.items ?? []).map(slot => (
                  <div key={slot.slot_id} className="interactive-card" style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 600 }}>Slot {slot.slot_id}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-green)' }}>Available</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <span>Zone: {slot.zone_id}</span>
                      <span>Dist: {slot.distance_m ?? "-"}m</span>
                    </div>
                  </div>
                ))}
                {!loading && (data?.smart_parking?.items?.length ?? 0) === 0 && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '20px 0' }}>No available parking nearby.</p>}
              </div>
            </div>
          </div>

          {/* AQI Card */}
          <div className="glass" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Wind size={20} color={hasHighPollution ? 'var(--accent-red)' : 'var(--text-primary)'} /><h3 style={{ margin: 0, fontSize: '18px' }}>City Environment</h3></div>
              <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: hasHighPollution ? 'var(--accent-red)' : 'var(--text-secondary)' }}>{hasHighPollution ? 'High Pollution' : 'Monitoring'}</span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center', minWidth: '120px' }}>
                <p style={{ margin: 0, fontSize: '64px', fontWeight: 800 }}>{avgAqi}</p>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Current AQI</p>
              </div>
              
              <div style={{ flex: 1, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {(data?.air_quality?.items ?? []).map(zone => (
                  <div key={zone.zone_id} style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 20px', borderRadius: '12px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--text-secondary)' }}>Zone {zone.zone_id}</p>
                    <p style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: getAqiColor(zone.aqi) }}>{zone.aqi ?? "--"}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: '24px', padding: '16px', borderRadius: '12px', background: hasHighPollution ? 'rgba(239, 68, 68, 0.1)' : 'rgba(56, 189, 248, 0.05)', border: hasHighPollution ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(56, 189, 248, 0.2)', display: 'flex', gap: '12px', alignItems: 'center' }}>
              {hasHighPollution ? <AlertTriangle color="var(--accent-red)" size={20} /> : <Wind color="var(--accent-cyan)" size={20} />}
              <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5 }}>
                {hasHighPollution ? "Air quality is poor in some zones. Consider public transit." : "Air quality is stable. Regular commuting is fine today."}
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
