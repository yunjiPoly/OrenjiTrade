package com.orenjitrade.api.profiles.domain;

import java.util.UUID;

/**
 * Extension point of {@code GET /api/v1/collectors/{handle}}: rating summary, implemented by the
 * ratings module (Phase 7). Without an implementation: {@link RatingSummary#NONE}.
 */
public interface RatingSummaryProvider {

    RatingSummary ratingOf(UUID userId);
}
