package com.synapsecity.fleet.service;

import com.synapsecity.fleet.dto.*;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class FleetTelemetryService {

    private final ScheduleMonitorService scheduleMonitorService;
    private final PriorityRequestProducer priorityRequestProducer;

    private final Map<String, BusSnapshot> latestByBusId = new ConcurrentHashMap<>();

    public FleetTelemetryService(ScheduleMonitorService scheduleMonitorService, PriorityRequestProducer priorityRequestProducer) {
        this.scheduleMonitorService = scheduleMonitorService;
        this.priorityRequestProducer = priorityRequestProducer;
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

        return new BusTelemetryResponse(
                telemetry.busId(),
                telemetry.routeId(),
                assessment.late(),
                shouldEmitPriority,
                occupancyFromPassengerCount(telemetry.passengerCount())
        );
    }

    public CommuterRouteResponse routeBuses(String routeId) {
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

        return new CommuterRouteResponse(routeId, buses);
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
