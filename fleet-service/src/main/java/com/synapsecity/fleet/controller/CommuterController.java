package com.synapsecity.fleet.controller;

import com.synapsecity.fleet.dto.CommuterRouteResponse;
import com.synapsecity.fleet.service.FleetTelemetryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

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

    /**
     * Returns the distinct list of route IDs currently in service.
     * Used by the commuter portal to populate the route selector dropdown.
     */
    @GetMapping("/routes")
    public Map<String, List<String>> availableRoutes() {
        return Map.of("routes", fleetTelemetryService.getAvailableRoutes());
    }
}
