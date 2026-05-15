package com.synapsecity.fleet.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record CrowdPredictionResponse(
        @JsonProperty("route_id") String routeId,
        int hour,
        int day,
        @JsonProperty("predicted_passengers") int predictedPassengers,
        @JsonProperty("model_version") int modelVersion
) {
}
