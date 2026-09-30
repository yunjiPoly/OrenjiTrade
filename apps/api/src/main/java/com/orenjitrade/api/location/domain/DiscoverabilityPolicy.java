package com.orenjitrade.api.location.domain;

import java.util.UUID;

/**
 * SPI answering whether a collector opted in to discoverability (implemented by the profiles module
 * from {@code privacy_settings.discoverable}). Without an implementation nobody is discoverable.
 * The location module stores a public point only for discoverable collectors (ADR 0004: collectors
 * who never opted in have {@code public_point = NULL}); the implementer calls {@link
 * LocationService#refreshPublicPoint} whenever the answer changes.
 */
public interface DiscoverabilityPolicy {

    boolean isDiscoverable(UUID userId);
}
