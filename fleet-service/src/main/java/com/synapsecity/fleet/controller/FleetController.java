package com.synapsecity.fleet.controller;

import com.synapsecity.fleet.dto.BusTelemetryRequest;
import com.synapsecity.fleet.dto.BusTelemetryResponse;
import com.synapsecity.fleet.service.FleetTelemetryService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/fleet")
public class FleetController {

    private final FleetTelemetryService fleetTelemetryService;

    public FleetController(FleetTelemetryService fleetTelemetryService) {
        this.fleetTelemetryService = fleetTelemetryService;
    }

    @PostMapping("/telemetry")
    public BusTelemetryResponse ingestTelemetry(@Valid @RequestBody BusTelemetryRequest payload) {
        return fleetTelemetryService.ingest(payload);
    }
}
