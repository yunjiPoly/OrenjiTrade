package com.orenjitrade.api.location.events;

import java.time.Instant;

/** Published after an admin moved a country to another region or (de)activated it. */
public record RegionsChangedEvent(String countryCode, Instant occurredAt) {}
