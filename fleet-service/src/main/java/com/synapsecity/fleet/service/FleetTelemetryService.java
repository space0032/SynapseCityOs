package com.synapsecity.fleet.service;

import com.synapsecity.fleet.dto.*;
import com.synapsecity.fleet.persistence.BusStatusEntity;
import com.synapsecity.fleet.persistence.BusStatusRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.ResponseEntity;

@Service
public class FleetTelemetryService {

    private final ScheduleMonitorService scheduleMonitorService;
    private final PriorityRequestProducer priorityRequestProducer;
    private final BusStatusRepository busStatusRepository;
    private final RestTemplate restTemplate;
    private final String predictionBaseUrl;

    private final Map<String, BusSnapshot> latestByBusId = new ConcurrentHashMap<>();
    private final Map<String, String> operationalStatus = new ConcurrentHashMap<>();

    public FleetTelemetryService(ScheduleMonitorService scheduleMonitorService,
                                  PriorityRequestProducer priorityRequestProducer,
                                  BusStatusRepository busStatusRepository,
                                  RestTemplate restTemplate,
                                  @Value("${PREDICTION_BASE_URL:http://prediction-engine:9100}") String predictionBaseUrl) {
        this.scheduleMonitorService = scheduleMonitorService;
        this.priorityRequestProducer = priorityRequestProducer;
        this.busStatusRepository = busStatusRepository;
        this.restTemplate = restTemplate;
        this.predictionBaseUrl = predictionBaseUrl;
        loadPersistedStatuses();
        seedInitialFleet();
    }

    /** Restores operational statuses previously saved to the DB. */
    private void loadPersistedStatuses() {
        try {
            busStatusRepository.findAll().forEach(e -> operationalStatus.put(e.getBusId(), e.getOperationalStatus()));
        } catch (Exception ignored) {
            // DB not available — in-memory seed will populate on first use
        }
    }

    /** Seeds a realistic in-memory fleet so the admin view is non-empty on first start. */
    private void seedInitialFleet() {
        double[][] coords = {
            {22.3080, 73.1997}, {22.3120, 73.2050}, {22.3005, 73.1890},
            {22.3200, 73.2100}, {22.2980, 73.2200}, {22.3150, 73.1950}
        };
        String[] routes = {"RTE-A", "RTE-B", "RTE-A", "RTE-C", "RTE-B", "RTE-D"};
        double[] speeds = {45.0, 38.0, 0.0, 52.0, 0.0, 28.0};
        int[] passengers = {25, 38, 0, 50, 0, 12};
        String[] statuses = {"active", "active", "maintenance", "active", "offline", "active"};

        for (int i = 0; i < 6; i++) {
            String busId = "BUS-10" + (i + 1);
            BusSnapshot snap = new BusSnapshot(
                    busId, routes[i],
                    new GpsCoordinatesDto(coords[i][0], coords[i][1]),
                    speeds[i], passengers[i], false
            );
            latestByBusId.put(busId, snap);
            operationalStatus.put(busId, statuses[i]);
        }
    }

    public BusTelemetryResponse ingest(BusTelemetryRequest telemetry) {
        ScheduleMonitorService.ScheduleAssessment assessment = scheduleMonitorService.assess(telemetry);
        boolean shouldEmitPriority = assessment.late() && assessment.approachingIntersection() && assessment.intersectionId() != null;

        if (shouldEmitPriority) {
            priorityRequestProducer.emit(telemetry.busId(), telemetry.routeId(), assessment.intersectionId());
        }

        BusSnapshot snapshot = new BusSnapshot(
                telemetry.busId(),
                telemetry.routeId(),
                telemetry.gpsCoordinates(),
                telemetry.speed(),
                telemetry.passengerCount(),
                assessment.late()
        );
        latestByBusId.put(telemetry.busId(), snapshot);
        operationalStatus.putIfAbsent(telemetry.busId(), "active");

        return new BusTelemetryResponse(
                telemetry.busId(),
                telemetry.routeId(),
                assessment.late(),
                shouldEmitPriority,
                occupancyFromPassengerCount(telemetry.passengerCount())
        );
    }

    public CommuterRouteResponse routeBuses(String routeId) {
        Integer predictedPassengers = null;
        OccupancyStatus predictedOccupancy = null;
        try {
            LocalDateTime now = LocalDateTime.now();
            CrowdPredictionRequest request = new CrowdPredictionRequest(routeId, now.getHour(), now.getDayOfWeek().getValue());
            ResponseEntity<CrowdPredictionResponse> response = restTemplate.postForEntity(
                    predictionBaseUrl + "/api/v1/prediction/crowd", request, CrowdPredictionResponse.class);
            if (response.getBody() != null) {
                predictedPassengers = response.getBody().predictedPassengers();
                predictedOccupancy = occupancyFromPassengerCount(predictedPassengers);
            }
        } catch (Exception ignored) {
            // Prediction engine unavailable
        }

        List<CommuterBusResponse> buses = latestByBusId.values().stream()
                .filter(snapshot -> routeId.equals(snapshot.routeId))
                .sorted(Comparator.comparing(BusSnapshot::busId))
                .map(snapshot -> new CommuterBusResponse(
                        snapshot.busId,
                        snapshot.gpsCoordinates,
                        snapshot.speed,
                        occupancyFromPassengerCount(snapshot.passengerCount),
                        snapshot.late
                ))
                .toList();

        return new CommuterRouteResponse(routeId, predictedPassengers, predictedOccupancy, buses);
    }

    /** Returns all known buses with their operational status for the admin fleet view. */
    public List<FleetAdminResponse> getAllBuses() {
        return latestByBusId.values().stream()
                .sorted(Comparator.comparing(BusSnapshot::busId))
                .map(snap -> new FleetAdminResponse(
                        snap.busId,
                        snap.routeId,
                        snap.gpsCoordinates,
                        snap.speed,
                        snap.passengerCount,
                        snap.late,
                        operationalStatus.getOrDefault(snap.busId, "active")
                ))
                .toList();
    }

    /** Returns distinct sorted route IDs currently tracked in the fleet (for commuter route picker). */
    public List<String> getAvailableRoutes() {
        return latestByBusId.values().stream()
                .map(BusSnapshot::routeId)
                .distinct()
                .sorted()
                .toList();
    }

    /** Applies an admin action (maintenance | active | acknowledge) to a specific bus. */
    public Map<String, String> performAction(String busId, String action) {
        if (!latestByBusId.containsKey(busId)) {
            return Map.of("error", "bus_not_found");
        }
        switch (action) {
            case "maintenance" -> operationalStatus.put(busId, "maintenance");
            case "active"      -> operationalStatus.put(busId, "active");
            case "acknowledge" -> { /* alert acknowledgement — status stays unchanged */ }
            default            -> { return Map.of("error", "unknown_action"); }
        }
        String newStatus = operationalStatus.getOrDefault(busId, "active");
        // Persist to DB
        try {
            busStatusRepository.save(new BusStatusEntity(busId, newStatus));
        } catch (Exception ignored) {}
        return Map.of("bus_id", busId, "new_status", newStatus);
    }

    OccupancyStatus occupancyFromPassengerCount(int passengerCount) {
        if (passengerCount <= 10) {
            return OccupancyStatus.EMPTY;
        }
        if (passengerCount <= 40) {
            return OccupancyStatus.MODERATE;
        }
        return OccupancyStatus.FULL;
    }

    record BusSnapshot(
            String busId,
            String routeId,
            GpsCoordinatesDto gpsCoordinates,
            double speed,
            int passengerCount,
            boolean late
    ) {
    }
}

