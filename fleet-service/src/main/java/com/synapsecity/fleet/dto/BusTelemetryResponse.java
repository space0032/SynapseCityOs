package com.synapsecity.fleet.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record BusTelemetryResponse(
        @JsonProperty("bus_id") String busId,
        @JsonProperty("route_id") String routeId,
        @JsonProperty("is_late") boolean late,
        @JsonProperty("priority_request_emitted") boolean priorityRequestEmitted,
        @JsonProperty("occupancy_status") OccupancyStatus occupancyStatus
) {
}
