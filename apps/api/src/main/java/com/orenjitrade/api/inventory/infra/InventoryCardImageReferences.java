package com.orenjitrade.api.inventory.infra;

import com.orenjitrade.api.cards.domain.images.CardImageReferenceSource;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Printings of inventory items (binder entries, unfiled items and, through their items, offers and
 * trades) for the {@code REFERENCED} card image cache fill (ADR 0015). Soft-deleted items are
 * included: offer and trade histories still show them.
 */
@Component
public class InventoryCardImageReferences implements CardImageReferenceSource {

    private final JdbcClient jdbc;

    public InventoryCardImageReferences(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String name() {
        return "inventory";
    }

    @Override
    public Set<UUID> referencedPrintingIds() {
        return new HashSet<>(
                jdbc.sql("SELECT DISTINCT printing_id FROM inventory_item")
                        .query(UUID.class)
                        .list());
    }
}
