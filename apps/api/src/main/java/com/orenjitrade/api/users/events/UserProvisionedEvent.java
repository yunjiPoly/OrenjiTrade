package com.orenjitrade.api.users.events;

import java.time.Instant;
import java.util.UUID;

/** Published once, when an account is created on its first authenticated request. */
public record UserProvisionedEvent(UUID userId, String handle, Instant occurredAt) {}
