import { useEffect, useState, useRef } from 'react';
import { Camera, Activity, AlertTriangle, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:9000";

export default function Dashboard() {
  const { hasRole } = useAuth();
  const [data, setData] = useState<any>({ cameras: [], traffic: [], alerts: { emergency_overrides: [], high_pollution_zones: [] } });
  const [newCam, setNewCam] = useState({ id: '', source: '', lane: '' });
  const [sourceType, setSourceType] = useState('rtsp');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const loadData = async () => {
    try {
      const [cameras, alerts] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/cameras`).then(res => res.json()),
        fetch(`${API_BASE_URL}/api/admin/active-alerts`).then(res => res.json()),
      ]);
      setData((prev: any) => ({
        ...prev,
        cameras: cameras.items || [],
        alerts: {
          emergency_overrides: alerts.emergency_overrides?.items || [],
          high_pollution_zones: alerts.high_pollution_zones?.items || []
        }
      }));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
    const int = setInterval(loadData, 10000);

    const wsUrl = (import.meta.env.VITE_BACKEND_WS_URL ?? "ws://localhost:8000") + "/api/v1/admin/live-traffic/ws";
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'live_traffic' && msg.data) {
          setData((prev: any) => ({ ...prev, traffic: msg.data.items || [] }));
        }
      } catch (e) {
        console.error("WebSocket message error", e);
      }
    };

    return () => {
      clearInterval(int);
      ws.close();
    };
  }, []);

  useEffect(() => {
    if (sourceType === 'webcam') {
      navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }).catch(console.error);
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    }
  }, [sourceType]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
    }
  };

  const handleAddCam = async (e: React.FormEvent) => {
    e.preventDefault();
    let finalSource = newCam.source;
    if (sourceType === 'webcam') {
      finalSource = '0';
    } else if (sourceType === 'file' && file) {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/cameras/upload`, {
          method: 'POST',
          body: formData
        });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        finalSource = data.url;
      } catch (err) {
        console.error(err);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    await fetch(`${API_BASE_URL}/api/admin/cameras`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sensor_id: newCam.id, source: finalSource, lane: newCam.lane })
    });
    setNewCam({ id: '', source: '', lane: '' });
    setFile(null);
    setPreviewUrl('');
    loadData();
  };

  const handleDeleteCam = async (id: string) => {
    await fetch(`${API_BASE_URL}/api/admin/cameras/${id}`, { method: 'DELETE' });
    loadData();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header style={{ marginBottom: '8px' }}>
        <h2 style={{ fontSize: '24px', margin: '0 0 8px' }}>City Overview</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Real-time telemetry and management controls.</p>
      </header>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        {hasRole(['city_operator']) && (
          <div className="glass" style={{ flex: '1 1 400px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Camera color="var(--accent-cyan)" />
              <h3 style={{ margin: 0, fontSize: '18px' }}>Camera Infrastructure</h3>
            </div>
            
            <form onSubmit={handleAddCam} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input placeholder="Sensor ID" value={newCam.id} onChange={e => setNewCam({...newCam, id: e.target.value})} required style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'rgba(15, 23, 42, 0.6)', color: 'white' }} />
                <input placeholder="Lane" value={newCam.lane} onChange={e => setNewCam({...newCam, lane: e.target.value})} required style={{ width: '80px', padding: '10px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'rgba(15, 23, 42, 0.6)', color: 'white' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={sourceType} onChange={e => setSourceType(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'rgba(15, 23, 42, 0.6)', color: 'white' }}>
                  <option value="rtsp">RTSP URL</option>
                  <option value="webcam">Webcam</option>
                  <option value="file">Upload File</option>
                </select>
                {sourceType === 'rtsp' && (
                  <input placeholder="Source (rtsp://...)" value={newCam.source} onChange={e => setNewCam({...newCam, source: e.target.value})} required style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'rgba(15, 23, 42, 0.6)', color: 'white' }} />
                )}
                {sourceType === 'file' && (
                  <input type="file" accept="video/*" onChange={handleFileChange} required style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'rgba(15, 23, 42, 0.6)', color: 'white' }} />
                )}
              </div>

              {(sourceType === 'webcam' || (sourceType === 'file' && previewUrl)) && (
                <div style={{ width: '100%', height: '200px', background: '#000', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                  {sourceType === 'webcam' ? (
                    <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <video src={previewUrl} autoPlay loop muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', color: 'white' }}>Preview</div>
                </div>
              )}

              <button type="submit" disabled={uploading} style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'var(--accent-cyan)', color: '#0f172a', fontWeight: 'bold', cursor: 'pointer', opacity: uploading ? 0.7 : 1 }}>
                {uploading ? 'Uploading...' : 'Add Camera'}
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {data.cameras.map((c: any) => (
                <div key={c.sensor_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{c.sensor_id} <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Lane: {c.lane}</span></div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{c.source}</div>
                  </div>
                  <button onClick={() => handleDeleteCam(c.sensor_id)} style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', marginLeft: '12px' }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="glass" style={{ flex: '1 1 300px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <Activity color="var(--accent-green)" />
            <h3 style={{ margin: 0, fontSize: '18px' }}>Live Traffic Nodes</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {data.traffic.map((t: any) => (
              <div key={t.intersection_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                <span style={{ fontWeight: 'bold' }}>{t.intersection_id}</span>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t.vehicle_count} vehicles, {t.pedestrian_count ?? 0} peds</span>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '4px 8px', borderRadius: '4px', background: t.signal_state === 'GREEN' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: t.signal_state === 'GREEN' ? 'var(--accent-green)' : 'var(--accent-red)' }}>{t.signal_state}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass" style={{ flex: '1 1 300px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <AlertTriangle color="var(--accent-orange)" />
            <h3 style={{ margin: 0, fontSize: '18px' }}>System Alerts</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {data.alerts.emergency_overrides.map((a: any, i: number) => (
              <div key={`em-${i}`} style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: 'var(--text-primary)' }}>
                <strong>Emergency Override</strong> at {a.intersection_id}
              </div>
            ))}
            {data.alerts.high_pollution_zones.map((a: any, i: number) => (
              <div key={`pol-${i}`} style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '8px', color: 'var(--text-primary)' }}>
                <strong>High Pollution</strong> in Zone {a.zone_id}
              </div>
            ))}
            {data.alerts.emergency_overrides.length === 0 && data.alerts.high_pollution_zones.length === 0 && (
              <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>No active alerts. System nominal.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
