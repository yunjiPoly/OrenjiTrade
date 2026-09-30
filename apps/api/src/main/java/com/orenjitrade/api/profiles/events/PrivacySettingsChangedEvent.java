package com.orenjitrade.api.profiles.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published when a collector saved their privacy settings. Listeners re-evaluate what depends on
 * them (e.g. the effective public visibility of the collector's inventory, which needs the
 * collector to be discoverable or to have a PUBLIC profile). Carries no setting values.
 *
 * @param userId the collector
 * @param occurredAt when
 */
public record PrivacySettingsChangedEvent(UUID userId, Instant occurredAt) {}
