import { useEffect, useState, useCallback } from 'react';
import {
  ShieldAlert, Wind, CheckCircle, RefreshCw,
  Clock, Zap, MapPin, Bell
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9000';
const POLL_INTERVAL = 10_000;

interface EmergencyOverride {
  intersection_id: string;
  vehicle_id: string;
  vehicle_type: string;
  cross_traffic_signal: string;
  emergency_path_signal: string;
  created_at: string;
  expires_at: string;
}

interface PollutionZone {
  zone_id: string;
  intersection_id?: string;
  aqi: number;
  pm25: number;
  no2: number;
  high_pollution: boolean;
  recorded_at: string;
}

interface AlertsData {
  emergency_overrides: EmergencyOverride[];
  high_pollution_zones: PollutionZone[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function expiresIn(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function AqiBar({ value, max = 300 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value < 50 ? 'var(--accent-green)' : value < 150 ? 'var(--accent-orange)' : 'var(--accent-red)';
  return (
    <div style={{ height: '6px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: '6px' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
    </div>
  );
}

export default function ActiveAlerts() {
  const [data, setData] = useState<AlertsData>({ emergency_overrides: [], high_pollution_zones: [] });
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [apiError, setApiError] = useState(false);
  const [tab, setTab] = useState<'all' | 'emergency' | 'pollution'>('all');

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/active-alerts`);
      if (!res.ok) throw new Error('non-2xx');
      const json = await res.json();
      setData({
        emergency_overrides: json.emergency_overrides?.items ?? [],
        high_pollution_zones: json.high_pollution_zones?.items ?? [],
      });
      setApiError(false);
    } catch {
      setApiError(true);
    } finally {
      setLoading(false);
      setLastSync(new Date());
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  const totalAlerts = data.emergency_overrides.length + data.high_pollution_zones.length;

  const shownOverrides   = tab === 'pollution' ? [] : data.emergency_overrides;
  const shownPollution   = tab === 'emergency' ? [] : data.high_pollution_zones;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: '0 0 6px', fontSize: '28px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ShieldAlert color="var(--accent-red)" size={32} />
            Active Alerts
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            <span className="pulse-dot" style={{ background: totalAlerts > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }} />
            Live monitoring — synced {lastSync.toLocaleTimeString()}
            {apiError && <span style={{ color: 'var(--accent-orange)', fontSize: '12px' }}>⚠ backend unreachable</span>}
          </p>
        </div>
        <button onClick={fetchAlerts} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '12px',
                   border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.05)',
                   color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
          <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </header>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '16px' }}>
        {[
          { label: 'Total Alerts',       value: totalAlerts,                       color: totalAlerts > 0 ? 'var(--accent-red)' : 'var(--accent-green)',    icon: <Bell size={20} />,           bg: totalAlerts > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)' },
          { label: 'Emergency Overrides', value: data.emergency_overrides.length,  color: 'var(--accent-red)',    icon: <Zap size={20} />,            bg: 'rgba(239,68,68,0.1)' },
          { label: 'High Pollution Zones',value: data.high_pollution_zones.length, color: 'var(--accent-orange)', icon: <Wind size={20} />,            bg: 'rgba(245,158,11,0.1)' },
          { label: 'System Status',      value: totalAlerts === 0 ? 'Nominal' : 'Alert',  color: totalAlerts === 0 ? 'var(--accent-green)' : 'var(--accent-red)', icon: <CheckCircle size={20} />, bg: totalAlerts === 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' },
        ].map(({ label, value, color, icon, bg }) => (
          <div key={label} className="glass hover-lift" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>{label}</span>
              <div style={{ padding: '8px', background: bg, borderRadius: '8px', color }}>{icon}</div>
            </div>
            <div style={{ fontSize: typeof value === 'number' ? '34px' : '22px', fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Tab Filter */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <div className="glass" style={{ display: 'flex', gap: '6px', padding: '6px', borderRadius: '12px' }}>
          {(['all', 'emergency', 'pollution'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                       background: tab === t ? 'var(--accent-red)' : 'transparent',
                       color: tab === t ? 'white' : 'var(--text-secondary)', textTransform: 'capitalize', transition: 'all 0.2s' }}>
              {t === 'all' ? 'All Alerts' : t === 'emergency' ? 'Emergency' : 'Pollution'}
            </button>
          ))}
        </div>
      </div>

      {/* Emergency Override Cards */}
      {shownOverrides.length > 0 && (
        <div className="glass" style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Zap color="var(--accent-red)" size={20} /> Emergency Signal Overrides
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {shownOverrides.map(o => (
              <div key={o.intersection_id} className="hover-lift"
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', alignItems: 'center',
                         padding: '16px', background: 'rgba(239,68,68,0.06)', borderRadius: '12px',
                         border: '1px solid rgba(239,68,68,0.2)' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Intersection</div>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={14} color="var(--accent-red)" /> {o.intersection_id}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Vehicle</div>
                  <div style={{ fontWeight: 600 }}>{o.vehicle_id}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{o.vehicle_type}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Signal Mode</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)', width: 'fit-content' }}>
                      Cross: {o.cross_traffic_signal}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)', width: 'fit-content' }}>
                      Emergency: {o.emergency_path_signal}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Expires in</div>
                  <div style={{ fontWeight: 700, color: 'var(--accent-orange)', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                    <Clock size={14} /> {expiresIn(o.expires_at)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Created {timeAgo(o.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* High Pollution Zone Cards */}
      {shownPollution.length > 0 && (
        <div className="glass" style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Wind color="var(--accent-orange)" size={20} /> High Pollution Zones
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: '16px' }}>
            {shownPollution.map(z => (
              <div key={z.zone_id} className="hover-lift"
                style={{ padding: '20px', background: 'rgba(245,158,11,0.06)', borderRadius: '12px',
                         border: '1px solid rgba(245,158,11,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Zone</div>
                    <div style={{ fontWeight: 700, fontSize: '18px' }}>{z.zone_id}</div>
                    {z.intersection_id && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>@ {z.intersection_id}</div>}
                  </div>
                  <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                                 background: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)' }}>
                    AQI {z.aqi}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '16px', fontSize: '13px', marginBottom: '10px' }}>
                  <div>
                    <div style={{ color: 'var(--text-secondary)' }}>PM2.5</div>
                    <div style={{ fontWeight: 700, color: z.pm25 >= 55 ? 'var(--accent-red)' : 'var(--text-primary)' }}>{z.pm25} μg/m³</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-secondary)' }}>NO₂</div>
                    <div style={{ fontWeight: 700, color: z.no2 >= 100 ? 'var(--accent-red)' : 'var(--text-primary)' }}>{z.no2} μg/m³</div>
                  </div>
                </div>

                <AqiBar value={z.aqi} />
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px', textAlign: 'right' }}>
                  Recorded {timeAgo(z.recorded_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalAlerts === 0 && !loading && (
        <div className="glass" style={{ padding: '60px', textAlign: 'center' }}>
          <CheckCircle size={56} color="var(--accent-green)" style={{ marginBottom: '16px', opacity: 0.7 }} />
          <h3 style={{ margin: '0 0 8px', fontSize: '20px' }}>All Systems Nominal</h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>No active emergency overrides or high pollution zones detected.</p>
        </div>
      )}
    </div>
  );
}
