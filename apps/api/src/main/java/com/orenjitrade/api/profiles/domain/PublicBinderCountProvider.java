package com.orenjitrade.api.profiles.domain;

import java.util.UUID;

/**
 * Extension point of {@code GET /api/v1/collectors/{handle}}: number of public binders, implemented
 * by the binders module (Phase 3). Without an implementation the count is 0.
 */
public interface PublicBinderCountProvider {

    int publicBinderCount(UUID userId);
}
