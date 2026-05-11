package com.synapsecity.fleet.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record CommuterBusResponse(
        @JsonProperty("bus_id") String busId,
        @JsonProperty("gps_coordinates") GpsCoordinatesDto gpsCoordinates,
        double speed,
        @JsonProperty("occupancy_status") OccupancyStatus occupancyStatus,
        @JsonProperty("is_late") boolean late
) {
}
