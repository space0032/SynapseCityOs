package com.synapsecity.fleet.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class PriorityRequestProducer {

    private static final Logger logger = LoggerFactory.getLogger(PriorityRequestProducer.class);
    private final List<PriorityRequestEvent> emittedEvents = new ArrayList<>();

    public synchronized void emit(String busId, String routeId, String intersectionId) {
        PriorityRequestEvent event = new PriorityRequestEvent(busId, routeId, intersectionId, Instant.now().toString());
        emittedEvents.add(event);
        logger.info("priority_request_event={} ", event);
    }

    public synchronized List<PriorityRequestEvent> emittedEvents() {
        return List.copyOf(emittedEvents);
    }

    public record PriorityRequestEvent(String busId, String routeId, String intersectionId, String emittedAt) {
    }
}
