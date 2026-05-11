package com.synapsecity.fleet.service;

import com.synapsecity.fleet.dto.*;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class FleetTelemetryServiceTest {

    @Test
    void shouldEmitPriorityRequestForLateBusNearIntersection() {
        PriorityRequestProducer producer = new PriorityRequestProducer();
        FleetTelemetryService service = new FleetTelemetryService(new ScheduleMonitorService(), producer);

        BusTelemetryResponse response = service.ingest(new BusTelemetryRequest(
                "BUS-3",
                new GpsCoordinatesDto(40.7136, -74.0045),
                30.0,
                41,
                "R1"
        ));

        assertThat(response.late()).isTrue();
        assertThat(response.priorityRequestEmitted()).isTrue();
        assertThat(response.occupancyStatus()).isEqualTo(OccupancyStatus.FULL);
        assertThat(producer.emittedEvents()).hasSize(1);
        assertThat(producer.emittedEvents().get(0).intersectionId()).isEqualTo("INT-A");
    }

    @Test
    void shouldReturnRouteBusesWithOccupancyStatus() {
        PriorityRequestProducer producer = new PriorityRequestProducer();
        FleetTelemetryService service = new FleetTelemetryService(new ScheduleMonitorService(), producer);

        service.ingest(new BusTelemetryRequest("BUS-4", new GpsCoordinatesDto(40.7314, -73.9340), 21.0, 5, "R2"));
        service.ingest(new BusTelemetryRequest("BUS-5", new GpsCoordinatesDto(40.7314, -73.9340), 17.0, 25, "R2"));

        CommuterRouteResponse response = service.routeBuses("R2");

        assertThat(response.routeId()).isEqualTo("R2");
        assertThat(response.buses()).hasSize(2);
        assertThat(response.buses().get(0).occupancyStatus()).isEqualTo(OccupancyStatus.EMPTY);
        assertThat(response.buses().get(1).occupancyStatus()).isEqualTo(OccupancyStatus.MODERATE);
    }
}
