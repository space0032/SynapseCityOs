# Synapse City OS - Commuter Mobile App (Phase 5)

Citizen-facing mobile app built with React Native + Expo.

## Features

- Live Transit Dashboard (bus location, ETA placeholder, seat availability)
- Smart Parking Finder (nearest available slots)
- Air Quality & Routing Alerts (public transit recommendation when pollution is high)
- Mock V2P Safety Alerts Receiver (simulated WebSocket/background danger event alert)

## API Configuration

This app reads the API Gateway base URL from:

- `EXPO_PUBLIC_API_BASE_URL` (default: `http://localhost:9000`)

Optional V2P socket simulation endpoint:

- `EXPO_PUBLIC_V2P_WS_URL` (if set, the app listens for incoming JSON danger events)
- `EXPO_PUBLIC_V2P_ALERT_INTERVAL_MS` (default `15000`)
- `EXPO_PUBLIC_V2P_ALERT_PROBABILITY` (default `0.15`)

Create a `.env` file in this folder if needed:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:9000
# For Android emulator use http://10.0.2.2:9000
# For physical device use your machine LAN IP, e.g. http://192.168.1.50:9000
EXPO_PUBLIC_V2P_ALERT_INTERVAL_MS=15000
EXPO_PUBLIC_V2P_ALERT_PROBABILITY=0.15
```

## Run Locally

```bash
cd commuter-app
npm install
npx expo start
```

Then open on:

- Android emulator (`a` in Expo CLI)
- iOS simulator on macOS (`i` in Expo CLI)
- Physical device with Expo Go (scan QR code)
- Web (`w` in Expo CLI)
