package com.orenjitrade.api.messaging.infra;

import com.orenjitrade.api.cards.domain.images.CardImageReferenceSource;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Printings shared as card links in private messages, for the {@code REFERENCED} card image cache
 * fill (ADR 0015). Only the printing ids are read; message content never leaves this module.
 */
@Component
public class MessagingCardImageReferences implements CardImageReferenceSource {

    private final JdbcClient jdbc;

    public MessagingCardImageReferences(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String name() {
        return "messaging";
    }

    @Override
    public Set<UUID> referencedPrintingIds() {
        return new HashSet<>(
                jdbc.sql(
                                """
                                SELECT DISTINCT CAST(payload -> 'card' ->> 'printingId' AS uuid)
                                  FROM message
                                 WHERE kind = 'CARD_LINK' AND deleted_at IS NULL
                                   AND payload -> 'card' ->> 'printingId'
                                       ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                """)
                        .query(UUID.class)
                        .list());
    }
}
