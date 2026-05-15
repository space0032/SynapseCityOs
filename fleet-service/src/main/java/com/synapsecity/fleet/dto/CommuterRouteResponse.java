package com.synapsecity.fleet.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public record CommuterRouteResponse(
        @JsonProperty("route_id") String routeId,
        @JsonProperty("predicted_passengers") Integer predictedPassengers,
        @JsonProperty("predicted_occupancy") OccupancyStatus predictedOccupancy,
        List<CommuterBusResponse> buses
) {
}
