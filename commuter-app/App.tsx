import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:9000";
const DEFAULT_ROUTE_ID = "R1";
const DEFAULT_LATITUDE = "22.3000";
const DEFAULT_LONGITUDE = "73.2000";

type BusItem = {
  bus_id: string;
  occupancy_status?: string;
  gps_coordinates?: {
    latitude?: number;
    longitude?: number;
  };
};

type ParkingItem = {
  slot_id: string;
  zone_id: string;
  distance_m?: number;
};

type PollutionItem = {
  zone_id: string;
  aqi?: number;
  high_pollution?: boolean;
};

type CommuterResponse = {
  route_id: string;
  bus_tracking?: {
    buses?: BusItem[];
  };
  smart_parking?: {
    count?: number;
    items?: ParkingItem[];
  };
  air_quality?: {
    count?: number;
    items?: PollutionItem[];
  };
};

type V2PAlertState = {
  active: boolean;
  message: string;
};

function seatLabel(status?: string): string {
  if (status === "EMPTY") return "Empty";
  if (status === "MODERATE") return "Moderate";
  if (status === "FULL") return "Full";
  return "Unknown";
}

function isDangerSignal(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const input = payload as Record<string, unknown>;
  const dangerType = String(input.danger_type ?? "").toLowerCase();
  const severity = String(input.severity ?? "").toLowerCase();
  return dangerType.includes("danger") || severity === "high" || severity === "critical";
}

export default function App() {
  const [routeId, setRouteId] = useState(DEFAULT_ROUTE_ID);
  const [latitude, setLatitude] = useState(DEFAULT_LATITUDE);
  const [longitude, setLongitude] = useState(DEFAULT_LONGITUDE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CommuterResponse | null>(null);
  const [v2pAlert, setV2pAlert] = useState<V2PAlertState>({
    active: false,
    message: "",
  });

  const hasHighPollution = useMemo(
    () => Boolean(data?.air_quality?.items?.some((item) => item.high_pollution)),
    [data]
  );

  const loadCommuterData = async () => {
    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({
        route_id: routeId || DEFAULT_ROUTE_ID,
        latitude: latitude || DEFAULT_LATITUDE,
        longitude: longitude || DEFAULT_LONGITUDE,
      });
      const response = await fetch(`${API_BASE_URL}/api/public/commuter?${query.toString()}`);
      if (!response.ok) {
        throw new Error(`Gateway request failed (${response.status})`);
      }
      const payload = (await response.json()) as CommuterResponse;
      setData(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load commuter data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCommuterData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const wsUrl = process.env.EXPO_PUBLIC_V2P_WS_URL;
    let socket: WebSocket | null = null;

    if (wsUrl) {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (isDangerSignal(payload)) {
            const message = "⚠️ Danger nearby. Stop and check traffic.";
            setV2pAlert({ active: true, message });
            Vibration.vibrate([0, 200, 100, 200]);
            Alert.alert("V2P Safety Alert", message);
          }
        } catch {
          // ignore malformed socket payloads
        }
      };
    }

    const timer = setInterval(() => {
      if (Math.random() < 0.15) {
        const message = "⚠️ V2P warning: approaching conflict zone.";
        setV2pAlert({ active: true, message });
        Vibration.vibrate([0, 250, 150, 250]);
      }
    }, 15000);

    return () => {
      clearInterval(timer);
      socket?.close();
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Synapse Commuter App</Text>
        <Text style={styles.subtitle}>API Gateway: {API_BASE_URL}</Text>

        {v2pAlert.active ? (
          <Pressable style={styles.v2pBanner} onPress={() => setV2pAlert({ active: false, message: "" })}>
            <Text style={styles.v2pText}>{v2pAlert.message}</Text>
            <Text style={styles.v2pDismiss}>Tap to dismiss</Text>
          </Pressable>
        ) : null}

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Live Transit Dashboard</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={routeId}
              onChangeText={setRouteId}
              placeholder="Route ID"
              autoCapitalize="characters"
            />
            <Pressable style={styles.button} onPress={() => void loadCommuterData()}>
              <Text style={styles.buttonText}>{loading ? "Loading..." : "Refresh"}</Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {(data?.bus_tracking?.buses ?? []).map((bus) => (
            <View key={bus.bus_id} style={styles.item}>
              <Text style={styles.itemTitle}>Bus {bus.bus_id}</Text>
              <Text>ETA: Real-time gateway feed</Text>
              <Text>Seats: {seatLabel(bus.occupancy_status)}</Text>
              <Text>
                Location: {bus.gps_coordinates?.latitude ?? "-"}, {bus.gps_coordinates?.longitude ?? "-"}
              </Text>
            </View>
          ))}
          {!loading && (data?.bus_tracking?.buses?.length ?? 0) === 0 ? (
            <Text style={styles.emptyText}>No active buses found for this route.</Text>
          ) : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Smart Parking Finder</Text>
          <View style={styles.row}>
            <TextInput style={styles.input} value={latitude} onChangeText={setLatitude} placeholder="Latitude" />
            <TextInput style={styles.input} value={longitude} onChangeText={setLongitude} placeholder="Longitude" />
          </View>
          {(data?.smart_parking?.items ?? []).map((slot) => (
            <View key={slot.slot_id} style={styles.item}>
              <Text style={styles.itemTitle}>Slot {slot.slot_id}</Text>
              <Text>Zone: {slot.zone_id}</Text>
              <Text>Distance: {slot.distance_m ?? "-"} m</Text>
            </View>
          ))}
          {!loading && (data?.smart_parking?.items?.length ?? 0) === 0 ? (
            <Text style={styles.emptyText}>No available parking slots nearby.</Text>
          ) : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Air Quality & Routing Alerts</Text>
          {hasHighPollution ? (
            <View style={styles.pollutionHigh}>
              <Text style={styles.pollutionText}>Air quality is poor. Suggestion: Use public transit today.</Text>
            </View>
          ) : (
            <View style={styles.pollutionNormal}>
              <Text style={styles.pollutionText}>Air quality is stable. Regular routing is fine.</Text>
            </View>
          )}
          {(data?.air_quality?.items ?? []).map((zone) => (
            <Text key={zone.zone_id} style={styles.zoneText}>
              Zone {zone.zone_id} · AQI {zone.aqi ?? "-"}
            </Text>
          ))}
        </View>
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#111827",
  },
  container: {
    padding: 16,
    gap: 14,
    backgroundColor: "#111827",
  },
  title: {
    fontSize: 28,
    color: "#f8fafc",
    fontWeight: "700",
  },
  subtitle: {
    color: "#94a3b8",
    marginBottom: 6,
  },
  panel: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  panelTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#111827",
    color: "#f8fafc",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  button: {
    backgroundColor: "#0ea5e9",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: {
    color: "#082f49",
    fontWeight: "700",
  },
  item: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    padding: 10,
    gap: 2,
  },
  itemTitle: {
    color: "#f8fafc",
    fontWeight: "600",
  },
  emptyText: {
    color: "#94a3b8",
  },
  errorText: {
    color: "#f87171",
    fontWeight: "600",
  },
  pollutionHigh: {
    backgroundColor: "#7f1d1d",
    borderRadius: 8,
    padding: 10,
  },
  pollutionNormal: {
    backgroundColor: "#064e3b",
    borderRadius: 8,
    padding: 10,
  },
  pollutionText: {
    color: "#f8fafc",
    fontWeight: "600",
  },
  zoneText: {
    color: "#e2e8f0",
  },
  v2pBanner: {
    borderRadius: 10,
    backgroundColor: "#dc2626",
    padding: 12,
    gap: 4,
  },
  v2pText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  v2pDismiss: {
    color: "#fee2e2",
    fontSize: 12,
  },
});
