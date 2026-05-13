package com.synapsecity.fleet.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record FleetAdminResponse(
        @JsonProperty("bus_id") String busId,
        @JsonProperty("route_id") String routeId,
        @JsonProperty("gps_coordinates") GpsCoordinatesDto gpsCoordinates,
        double speed,
        @JsonProperty("passenger_count") int passengerCount,
        @JsonProperty("is_late") boolean late,
        @JsonProperty("operational_status") String operationalStatus
) {
}
