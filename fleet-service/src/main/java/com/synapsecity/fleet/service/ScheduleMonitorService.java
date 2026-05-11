package com.synapsecity.fleet.service;

import com.synapsecity.fleet.dto.BusTelemetryRequest;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class ScheduleMonitorService {

    private static final Map<String, RouteScheduleConfig> ROUTE_CONFIGS = Map.of(
            "R1", new RouteScheduleConfig(40.7128, -74.0060, 0.10, "INT-A", 40.7136, -74.0045, 0.25),
            "R2", new RouteScheduleConfig(40.7306, -73.9352, 0.15, "INT-B", 40.7314, -73.9340, 0.30)
    );

    public ScheduleAssessment assess(BusTelemetryRequest telemetry) {
        RouteScheduleConfig config = ROUTE_CONFIGS.get(telemetry.routeId());
        if (config == null) {
            return new ScheduleAssessment(false, false, null);
        }

        double distanceToCheckpointKm = haversineKm(
                telemetry.gpsCoordinates().latitude(),
                telemetry.gpsCoordinates().longitude(),
                config.expectedLat,
                config.expectedLon
        );

        boolean isLate = distanceToCheckpointKm > config.maxDistanceFromCheckpointKm;

        double distanceToIntersectionKm = haversineKm(
                telemetry.gpsCoordinates().latitude(),
                telemetry.gpsCoordinates().longitude(),
                config.intersectionLat,
                config.intersectionLon
        );

        boolean approachingIntersection = distanceToIntersectionKm <= config.priorityTriggerDistanceKm;
        return new ScheduleAssessment(isLate, approachingIntersection, config.intersectionId);
    }

    private static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double radiusKm = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);

        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return radiusKm * c;
    }

    private record RouteScheduleConfig(
            double expectedLat,
            double expectedLon,
            double maxDistanceFromCheckpointKm,
            String intersectionId,
            double intersectionLat,
            double intersectionLon,
            double priorityTriggerDistanceKm
    ) {
    }

    public record ScheduleAssessment(boolean late, boolean approachingIntersection, String intersectionId) {
    }
}
