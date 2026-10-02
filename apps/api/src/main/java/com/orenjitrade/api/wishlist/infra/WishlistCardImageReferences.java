package com.orenjitrade.api.wishlist.infra;

import com.orenjitrade.api.cards.domain.images.CardImageReferenceSource;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Cards and printings collectors are looking for, for the {@code REFERENCED} card image cache fill
 * (ADR 0015).
 */
@Component
public class WishlistCardImageReferences implements CardImageReferenceSource {

    private final JdbcClient jdbc;

    public WishlistCardImageReferences(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String name() {
        return "wishlist";
    }

    @Override
    public Set<UUID> referencedPrintingIds() {
        return new HashSet<>(
                jdbc.sql(
                                "SELECT DISTINCT printing_id FROM wishlist_item WHERE printing_id"
                                        + " IS NOT NULL")
                        .query(UUID.class)
                        .list());
    }

    @Override
    public Set<UUID> referencedCardIds() {
        return new HashSet<>(
                jdbc.sql(
                                "SELECT DISTINCT card_id FROM wishlist_item WHERE printing_id IS"
                                        + " NULL AND card_id IS NOT NULL")
                        .query(UUID.class)
                        .list());
    }
}
