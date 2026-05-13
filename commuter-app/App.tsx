import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  Vibration,
  View,
} from "react-native";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:9000";
const DEFAULT_ROUTE_ID = "R1";
const DEFAULT_LATITUDE = "22.3000";
const DEFAULT_LONGITUDE = "73.2000";
const MOCK_V2P_ALERT_INTERVAL_MS = Number(process.env.EXPO_PUBLIC_V2P_ALERT_INTERVAL_MS ?? "15000");
const MOCK_V2P_ALERT_PROBABILITY = Number(process.env.EXPO_PUBLIC_V2P_ALERT_PROBABILITY ?? "0.15");

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

function getAqiColor(aqi?: number): string {
  if (!aqi) return "#94a3b8";
  if (aqi < 50) return "#10b981";
  if (aqi < 100) return "#f59e0b";
  return "#ef4444";
}

function isDangerSignal(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const input = payload as Record<string, unknown>;
  const dangerType = String(input.danger_type ?? "").toLowerCase();
  const severity = String(input.severity ?? "").toLowerCase();
  return dangerType.includes("danger") || severity === "high" || severity === "critical";
}

// Glassmorphism helper for web
const glassStyle = Platform.OS === "web" ? { backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" } : {};

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

  const { width } = useWindowDimensions();
  const isDesktop = width > 800;

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
      if (Math.random() < MOCK_V2P_ALERT_PROBABILITY) {
        const message = "⚠️ V2P warning: pedestrian approaching conflict zone.";
        setV2pAlert({ active: true, message });
        Vibration.vibrate([0, 250, 150, 250]);
      }
    }, MOCK_V2P_ALERT_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      socket?.close();
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Background Blobs (Web only for performance, or absolute positioned) */}
      {Platform.OS === "web" && (
        <>
          <View style={[styles.blob, styles.blob1]} />
          <View style={[styles.blob, styles.blob2]} />
        </>
      )}

      <View style={[styles.header, glassStyle]}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoIcon}>⚡</Text>
          <Text style={styles.logoText}>Synapse<Text style={styles.logoAccent}>City</Text></Text>
        </View>
        <View style={[styles.statusBadge, error ? styles.statusBadgeOffline : null]}>
          <View style={[styles.pulse, error ? styles.pulseOffline : null]} />
          <Text style={[styles.statusText, error ? styles.statusTextOffline : null]}>
            {error ? "Gateway Offline" : "Gateway Online"}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {v2pAlert.active ? (
          <Pressable style={styles.v2pBanner} onPress={() => setV2pAlert({ active: false, message: "" })}>
            <Text style={styles.alertIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.v2pText}>{v2pAlert.message}</Text>
            </View>
            <Text style={styles.v2pDismiss}>✕</Text>
          </Pressable>
        ) : null}

        <View style={[styles.mainLayout, isDesktop && styles.mainLayoutDesktop]}>
          {/* SIDEBAR */}
          <View style={[styles.sidebar, isDesktop && styles.sidebarDesktop]}>
            <View style={[styles.panel, glassStyle]}>
              <View style={styles.userProfile}>
                <View style={styles.avatar}><Text style={styles.avatarText}>A</Text></View>
                <View>
                  <Text style={styles.welcomeText}>Welcome, Commuter</Text>
                  <Text style={styles.locationText}>Loc: {latitude}, {longitude}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.panel, glassStyle]}>
              <Text style={styles.panelTitle}>Controls</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Route Identifier</Text>
                <TextInput
                  style={styles.input}
                  value={routeId}
                  onChangeText={setRouteId}
                  placeholder="e.g. R1"
                  autoCapitalize="characters"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Latitude</Text>
                <TextInput style={styles.input} value={latitude} onChangeText={setLatitude} />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Longitude</Text>
                <TextInput style={styles.input} value={longitude} onChangeText={setLongitude} />
              </View>
              <Pressable style={styles.button} onPress={() => void loadCommuterData()}>
                <Text style={styles.buttonText}>{loading ? "Syncing..." : "Refresh Dashboard"}</Text>
              </Pressable>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            <View style={styles.statsRow}>
              <View style={[styles.statCard, glassStyle]}>
                <Text style={styles.statLabel}>Active Buses</Text>
                <Text style={styles.statValue}>{data?.bus_tracking?.buses?.length ?? 0}</Text>
              </View>
              <View style={[styles.statCard, glassStyle]}>
                <Text style={styles.statLabel}>Parking Spots</Text>
                <Text style={styles.statValue}>{data?.smart_parking?.items?.length ?? 0}</Text>
              </View>
            </View>
          </View>

          {/* DASHBOARD CONTENT */}
          <View style={styles.dashboardContent}>
            <View style={[styles.dashboardGrid, isDesktop && styles.dashboardGridDesktop]}>
              
              {/* TRANSIT CARD */}
              <View style={[styles.panel, styles.cardHalf, glassStyle]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.panelTitle}>Live Transit Feed</Text>
                  <View style={styles.badge}><Text style={styles.badgeText}>Real-time</Text></View>
                </View>
                <View style={styles.dataList}>
                  {(data?.bus_tracking?.buses ?? []).map((bus) => (
                    <View key={bus.bus_id} style={styles.item}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.itemTitle}>Bus {bus.bus_id}</Text>
                        <View style={[styles.occupancyTag, bus.occupancy_status === 'EMPTY' ? styles.tagEmpty : bus.occupancy_status === 'MODERATE' ? styles.tagMod : styles.tagFull]}>
                          <Text style={[styles.tagText, bus.occupancy_status === 'EMPTY' ? styles.tagTextEmpty : bus.occupancy_status === 'MODERATE' ? styles.tagTextMod : styles.tagTextFull]}>
                            {seatLabel(bus.occupancy_status)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.rowBetween}>
                        <Text style={styles.itemSub}>ETA: <Text style={{color: '#38bdf8'}}>Live</Text></Text>
                        <Text style={styles.itemSub}>Lat: {bus.gps_coordinates?.latitude?.toFixed(4) ?? "-"}</Text>
                      </View>
                    </View>
                  ))}
                  {!loading && (data?.bus_tracking?.buses?.length ?? 0) === 0 ? (
                    <Text style={styles.emptyText}>No active buses on this route.</Text>
                  ) : null}
                </View>
              </View>

              {/* PARKING CARD */}
              <View style={[styles.panel, styles.cardHalf, glassStyle]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.panelTitle}>Smart Parking</Text>
                  <View style={styles.badge}><Text style={styles.badgeText}>Nearby</Text></View>
                </View>
                <View style={styles.dataList}>
                  {(data?.smart_parking?.items ?? []).map((slot) => (
                    <View key={slot.slot_id} style={styles.item}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.itemTitle}>Slot {slot.slot_id}</Text>
                        <Text style={{color: '#10b981', fontSize: 12, fontWeight: 'bold'}}>Available</Text>
                      </View>
                      <View style={styles.rowBetween}>
                        <Text style={styles.itemSub}>Zone: {slot.zone_id}</Text>
                        <Text style={styles.itemSub}>Dist: {slot.distance_m ?? "-"}m</Text>
                      </View>
                    </View>
                  ))}
                  {!loading && (data?.smart_parking?.items?.length ?? 0) === 0 ? (
                    <Text style={styles.emptyText}>No available parking nearby.</Text>
                  ) : null}
                </View>
              </View>

              {/* AQI CARD (Full Width) */}
              <View style={[styles.panel, styles.cardFull, glassStyle]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.panelTitle}>City Environment</Text>
                  <View style={styles.badge}><Text style={[styles.badgeText, hasHighPollution && {color: '#ef4444'}]}>{hasHighPollution ? 'High Pollution' : 'Monitoring'}</Text></View>
                </View>
                
                <View style={[styles.aqiContainer, isDesktop && styles.aqiContainerDesktop]}>
                  <View style={styles.aqiMain}>
                    <Text style={styles.aqiValue}>{avgAqi}</Text>
                    <Text style={styles.aqiLabel}>Current AQI</Text>
                  </View>
                  
                  <View style={styles.aqiZones}>
                    {(data?.air_quality?.items ?? []).map((zone) => (
                      <View key={zone.zone_id} style={styles.zoneItem}>
                        <Text style={styles.zoneName}>Zone {zone.zone_id}</Text>
                        <Text style={[styles.zoneVal, {color: getAqiColor(zone.aqi)}]}>{zone.aqi ?? "--"}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {hasHighPollution ? (
                  <View style={styles.pollutionHigh}>
                    <Text style={styles.pollutionText}>⚠️ Air quality is poor in some zones. Consider public transit.</Text>
                  </View>
                ) : (
                  <View style={styles.pollutionNormal}>
                    <Text style={styles.pollutionText}>Air quality is stable. Regular commuting is fine today.</Text>
                  </View>
                )}
              </View>

            </View>
          </View>
        </View>

      </ScrollView>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0b0f19" },
  blob: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
    opacity: 0.15,
  },
  blob1: {
    top: -100,
    left: -100,
    backgroundColor: '#38bdf8',
    ...(Platform.OS === 'web' ? { filter: 'blur(100px)' } : {}),
  },
  blob2: {
    bottom: -100,
    right: -100,
    backgroundColor: '#10b981',
    ...(Platform.OS === 'web' ? { filter: 'blur(100px)' } : {}),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 10,
  },
  logoContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon: { fontSize: 24, color: '#38bdf8' },
  logoText: { fontSize: 20, fontWeight: '700', color: '#f8fafc', letterSpacing: -0.5 },
  logoAccent: { color: '#38bdf8' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    gap: 8,
  },
  statusBadgeOffline: { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)' },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' },
  pulseOffline: { backgroundColor: '#ef4444' },
  statusText: { color: '#10b981', fontSize: 12, fontWeight: '600' },
  statusTextOffline: { color: '#ef4444' },
  scrollContent: { padding: 24, paddingBottom: 60, flexGrow: 1 },
  mainLayout: { flexDirection: 'column', gap: 24 },
  mainLayoutDesktop: { flexDirection: 'row' },
  sidebar: { width: '100%', gap: 16 },
  sidebarDesktop: { width: 320 },
  dashboardContent: { flex: 1 },
  dashboardGrid: { flexDirection: 'column', gap: 16 },
  dashboardGridDesktop: { flexDirection: 'row', flexWrap: 'wrap' },
  cardHalf: { flex: 1, minWidth: 300 },
  cardFull: { width: '100%' },
  panel: {
    backgroundColor: "rgba(30, 41, 59, 0.7)",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 16,
  },
  userProfile: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  welcomeText: { color: '#f8fafc', fontSize: 16, fontWeight: '600' },
  locationText: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  panelTitle: { color: "#f8fafc", fontSize: 18, fontWeight: "700" },
  badge: { backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  badgeText: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  inputGroup: { marginBottom: 12 },
  label: { color: '#94a3b8', fontSize: 13, fontWeight: '500', marginBottom: 6 },
  input: { backgroundColor: "rgba(15, 23, 42, 0.6)", color: "#f8fafc", borderWidth: 1, borderColor: "#334155", borderRadius: 12, padding: 12, fontSize: 15 },
  button: { backgroundColor: "#38bdf8", borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: "#0f172a", fontWeight: "700", fontSize: 15 },
  statsRow: { flexDirection: 'row', gap: 16 },
  statCard: { flex: 1, backgroundColor: "rgba(30, 41, 59, 0.7)", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.1)" },
  statLabel: { color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', fontWeight: 'bold', marginBottom: 8 },
  statValue: { color: '#38bdf8', fontSize: 28, fontWeight: '800' },
  dataList: { gap: 12 },
  item: { backgroundColor: "rgba(255, 255, 255, 0.03)", borderRadius: 14, padding: 16, gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { color: "#f8fafc", fontSize: 15, fontWeight: "600" },
  itemSub: { color: "#94a3b8", fontSize: 13 },
  occupancyTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tagEmpty: { backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  tagMod: { backgroundColor: 'rgba(245, 158, 11, 0.1)' },
  tagFull: { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  tagText: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  tagTextEmpty: { color: '#10b981' },
  tagTextMod: { color: '#f59e0b' },
  tagTextFull: { color: '#ef4444' },
  emptyText: { color: "#64748b", fontStyle: "italic", textAlign: "center", marginVertical: 20 },
  errorText: { color: "#ef4444", fontWeight: "600", backgroundColor: "rgba(239, 68, 68, 0.1)", padding: 12, borderRadius: 8, textAlign: "center", marginTop: 12 },
  aqiContainer: { flexDirection: 'column', alignItems: 'center', gap: 24, marginVertical: 16 },
  aqiContainerDesktop: { flexDirection: 'row' },
  aqiMain: { alignItems: 'center' },
  aqiValue: { fontSize: 64, fontWeight: '800', color: '#f8fafc' },
  aqiLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '500' },
  aqiZones: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  zoneItem: { backgroundColor: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12, alignItems: 'center', minWidth: 100 },
  zoneName: { color: '#94a3b8', fontSize: 12, marginBottom: 4 },
  zoneVal: { fontSize: 20, fontWeight: 'bold' },
  pollutionHigh: { backgroundColor: "rgba(239, 68, 68, 0.1)", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.3)" },
  pollutionNormal: { backgroundColor: "rgba(56, 189, 248, 0.05)", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "rgba(56, 189, 248, 0.2)" },
  pollutionText: { color: "#f8fafc", fontSize: 14, lineHeight: 20 },
  v2pBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: "#ef4444", borderRadius: 16, padding: 16, gap: 12, marginBottom: 24 },
  alertIcon: { fontSize: 20 },
  v2pText: { color: "#fff", fontWeight: "700", fontSize: 15, lineHeight: 22 },
  v2pDismiss: { color: "rgba(255, 255, 255, 0.8)", fontSize: 20 },
});
