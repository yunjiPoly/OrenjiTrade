package com.orenjitrade.api.profiles.domain;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Extension point of {@code GET /api/v1/collectors/{handle}}, map markers and previews: rating
 * summary, implemented by the ratings module (Phase 7). Without an implementation: {@link
 * RatingSummary#NONE}.
 */
public interface RatingSummaryProvider {

    RatingSummary ratingOf(UUID userId);

    /**
     * Summaries of several collectors at once (map pages); collectors without ratings map to {@link
     * RatingSummary#NONE}. The default asks one by one.
     */
    default Map<UUID, RatingSummary> ratingsOf(Collection<UUID> userIds) {
        Map<UUID, RatingSummary> result = new LinkedHashMap<>();
        for (UUID id : userIds) {
            result.put(id, ratingOf(id));
        }
        return result;
    }
}
