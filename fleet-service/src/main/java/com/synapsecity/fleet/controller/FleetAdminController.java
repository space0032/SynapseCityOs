package com.synapsecity.fleet.controller;

import com.synapsecity.fleet.dto.FleetAdminResponse;
import com.synapsecity.fleet.service.FleetTelemetryService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin/fleet")
public class FleetAdminController {

    private final FleetTelemetryService fleetTelemetryService;

    public FleetAdminController(FleetTelemetryService fleetTelemetryService) {
        this.fleetTelemetryService = fleetTelemetryService;
    }

    @GetMapping
    public List<FleetAdminResponse> getAllFleet() {
        return fleetTelemetryService.getAllBuses();
    }

    @PostMapping("/{busId}/action")
    public Map<String, String> performAction(
            @PathVariable("busId") String busId,
            @RequestBody Map<String, String> body
    ) {
        String action = body.getOrDefault("action", "");
        return fleetTelemetryService.performAction(busId, action);
    }
}
