package com.orenjitrade.api.users.domain;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Extension point: the location module provides the platform region of the collector's declared
 * location (ADR 0017), shown in {@code MeResponse} so clients browse the home region without a
 * second call. Without an implementation, or without a location, the region is {@code null}.
 */
public interface HomeRegionProvider {

    @Nullable String homeRegionOf(UUID userId);
}
