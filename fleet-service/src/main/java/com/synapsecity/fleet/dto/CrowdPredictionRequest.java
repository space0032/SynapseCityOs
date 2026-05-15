package com.synapsecity.fleet.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record CrowdPredictionRequest(
        @JsonProperty("route_id") String routeId,
        int hour,
        int day
) {
}
