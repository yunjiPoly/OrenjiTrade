package com.orenjitrade.api.community.infra;

import com.orenjitrade.api.cards.domain.images.CardImageReferenceSource;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Printings shared as card links in community posts, for the {@code REFERENCED} card image cache
 * fill (ADR 0015).
 */
@Component
public class CommunityCardImageReferences implements CardImageReferenceSource {

    private final JdbcClient jdbc;

    public CommunityCardImageReferences(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String name() {
        return "community";
    }

    @Override
    public Set<UUID> referencedPrintingIds() {
        return new HashSet<>(
                jdbc.sql(
                                """
                                SELECT DISTINCT CAST(payload -> 'card' ->> 'printingId' AS uuid)
                                  FROM community_post
                                 WHERE deleted_at IS NULL AND removed_at IS NULL
                                   AND payload -> 'card' ->> 'printingId'
                                       ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                """)
                        .query(UUID.class)
                        .list());
    }
}
