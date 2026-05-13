package com.synapsecity.fleet.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

public interface BusStatusRepository extends JpaRepository<BusStatusEntity, String> {
}
