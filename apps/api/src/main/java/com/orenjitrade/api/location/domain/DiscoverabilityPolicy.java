package com.orenjitrade.api.location.domain;

import java.util.UUID;

/**
 * SPI answering whether a collector opted in to discoverability (implemented by the profiles module
 * from {@code privacy_settings.discoverable}); only reported back to the owner in {@code GET
 * /me/location}. Without an implementation nobody is discoverable. Discoverability needs a country
 * and a subdivision: the profiles module refuses to turn it on without them ({@code 409
 * LOCATION_REQUIRED}) and turns it off when the location is removed ({@link
 * com.orenjitrade.api.location.events.LocationRemovedEvent}).
 */
public interface DiscoverabilityPolicy {

    boolean isDiscoverable(UUID userId);
}
