package com.synapsecity.fleet.controller;

import com.synapsecity.fleet.dto.CommuterRouteResponse;
import com.synapsecity.fleet.service.FleetTelemetryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/commuter")
public class CommuterController {

    private final FleetTelemetryService fleetTelemetryService;

    public CommuterController(FleetTelemetryService fleetTelemetryService) {
        this.fleetTelemetryService = fleetTelemetryService;
    }

    @GetMapping("/buses/{route_id}")
    public CommuterRouteResponse busesByRoute(@PathVariable("route_id") String routeId) {
        return fleetTelemetryService.routeBuses(routeId);
    }
}
