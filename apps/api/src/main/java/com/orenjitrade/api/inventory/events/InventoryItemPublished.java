package com.orenjitrade.api.inventory.events;

import com.orenjitrade.api.inventory.domain.Availability;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * An inventory item became effectively public: created public, visibility changed to public, its
 * binder was published, restored from HIDDEN, or its owner became listed again. Emitted exactly
 * once per transition, inside the transaction that caused it (transactional outbox). Consumed by
 * wishlist matching (Phase 6) and analytics. Carries no private notes and no location.
 *
 * @param itemId item
 * @param ownerId owner
 * @param printingId printing
 * @param cardId card
 * @param gameSlug game
 * @param availability what the owner offers
 * @param askingPrice asking price, when set
 * @param currency ISO 4217 code
 * @param publishedAt when the transition happened
 */
public record InventoryItemPublished(
        UUID itemId,
        UUID ownerId,
        UUID printingId,
        UUID cardId,
        String gameSlug,
        Availability availability,
        @Nullable BigDecimal askingPrice,
        String currency,
        Instant publishedAt) {}
