import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState } from 'react';

// Fix for default marker icons in React-Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:9000";

interface MapData {
  anomalies: any[];
  pollution: any[];
  parking: any[];
}

export default function MapVisualizer() {
  const [data, setData] = useState<MapData>({ anomalies: [], pollution: [], parking: [] });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [anomaliesRes, pollutionRes, parkingRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/admin/road-health`).then(res => res.json()),
          fetch(`${API_BASE_URL}/api/gateway/alerts/pollution/high`).then(res => res.json()),
          fetch(`${API_BASE_URL}/api/gateway/parking/availability?latitude=22.3&longitude=73.2&limit=50`).then(res => res.json())
        ]);
        setData({
          anomalies: anomaliesRes.items || [],
          pollution: pollutionRes.items || [],
          parking: parkingRes.items || []
        });
      } catch (e) {
        console.error("Failed to fetch map data", e);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ height: '400px', width: '100%' }}>
      <MapContainer center={[22.3000, 73.2000]} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        {data.anomalies.map((a: any, i: number) => (
          <Marker key={`anom-${i}`} position={[a.latitude, a.longitude]}>
            <Popup>Road Anomaly (Pothole)<br/>Z-Accel: {a.z_accel}</Popup>
          </Marker>
        ))}

        {data.parking.map((p: any, i: number) => (
          <Circle key={`park-${i}`} center={[p.latitude, p.longitude]} radius={50} pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.4 }}>
            <Popup>Parking Slot {p.slot_id}<br/>Available</Popup>
          </Circle>
        ))}

        {data.pollution.map((p: any, i: number) => (
          <Circle key={`pol-${i}`} center={[22.3 + (i * 0.01), 73.2 + (i * 0.01)] /* mock lat/lng since not provided by backend directly for zones */} radius={500} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.3 }}>
            <Popup>High Pollution Zone {p.zone_id}<br/>AQI: {p.aqi}</Popup>
          </Circle>
        ))}
      </MapContainer>
    </div>
  );
}
