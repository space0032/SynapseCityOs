package com.synapsecity.fleet.service;

import com.synapsecity.fleet.dto.BusTelemetryRequest;
import com.synapsecity.fleet.dto.GpsCoordinatesDto;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ScheduleMonitorServiceTest {

    private final ScheduleMonitorService scheduleMonitorService = new ScheduleMonitorService();

    @Test
    void shouldFlagLateBusAndApproachingIntersectionForConfiguredRoute() {
        BusTelemetryRequest request = new BusTelemetryRequest(
                "BUS-1",
                new GpsCoordinatesDto(40.7136, -74.0045),
                24.0,
                18,
                "R1"
        );

        ScheduleMonitorService.ScheduleAssessment assessment = scheduleMonitorService.assess(request);

        assertThat(assessment.late()).isTrue();
        assertThat(assessment.approachingIntersection()).isTrue();
        assertThat(assessment.intersectionId()).isEqualTo("INT-A");
    }

    @Test
    void shouldReturnNotLateForUnknownRoute() {
        BusTelemetryRequest request = new BusTelemetryRequest(
                "BUS-2",
                new GpsCoordinatesDto(10.0, 10.0),
                10.0,
                5,
                "UNKNOWN"
        );

        ScheduleMonitorService.ScheduleAssessment assessment = scheduleMonitorService.assess(request);

        assertThat(assessment.late()).isFalse();
        assertThat(assessment.approachingIntersection()).isFalse();
        assertThat(assessment.intersectionId()).isNull();
    }
}
