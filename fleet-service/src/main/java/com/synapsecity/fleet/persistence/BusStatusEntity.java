package com.synapsecity.fleet.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Persists the operational status of a bus across service restarts.
 * All other fleet telemetry is ephemeral (real-time snapshots).
 */
@Entity
@Table(name = "bus_operational_status")
public class BusStatusEntity {

    @Id
    @Column(name = "bus_id", nullable = false, length = 50)
    private String busId;

    @Column(name = "operational_status", nullable = false, length = 30)
    private String operationalStatus;

    public BusStatusEntity() {}

    public BusStatusEntity(String busId, String operationalStatus) {
        this.busId = busId;
        this.operationalStatus = operationalStatus;
    }

    public String getBusId() { return busId; }
    public void setBusId(String busId) { this.busId = busId; }

    public String getOperationalStatus() { return operationalStatus; }
    public void setOperationalStatus(String operationalStatus) { this.operationalStatus = operationalStatus; }
}
