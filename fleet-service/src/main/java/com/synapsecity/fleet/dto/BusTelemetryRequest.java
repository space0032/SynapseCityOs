package com.synapsecity.fleet.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record BusTelemetryRequest(
        @NotBlank
        @JsonProperty("bus_id")
        String busId,

        @NotNull
        @Valid
        @JsonProperty("gps_coordinates")
        GpsCoordinatesDto gpsCoordinates,

        @NotNull
        @PositiveOrZero
        Double speed,

        @NotNull
        @Min(0)
        @JsonProperty("passenger_count")
        Integer passengerCount,

        @NotBlank
        @JsonProperty("route_id")
        String routeId
) {
}
