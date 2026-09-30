package com.orenjitrade.api.inventory.domain;

import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * One inventory item as stored, with its card, binder name and live effective visibility.
 *
 * @param id item id
 * @param ownerId owner
 * @param binderId binder, {@code null} when unfiled
 * @param binderName binder name
 * @param printingId printing
 * @param cardId card
 * @param cardName card name
 * @param game game slug
 * @param quantity copies (1-9 999)
 * @param condition condition code
 * @param language ISO 639-1 code
 * @param edition edition code
 * @param finish finish code
 * @param askingPrice asking price
 * @param currency ISO 4217 code
 * @param availability what the owner offers
 * @param acceptsOffers whether offers are welcome
 * @param notes PRIVATE owner notes
 * @param publicNotes notes shown publicly
 * @param visibility the owner's choice
 * @param publicUntil end of a temporary publication
 * @param freshnessState derived freshness
 * @param confirmedAt last owner confirmation
 * @param createdAt creation
 * @param updatedAt last owner edit
 * @param effectivePublic whether the item is public right now
 */
public record ItemRow(
        UUID id,
        UUID ownerId,
        @Nullable UUID binderId,
        @Nullable String binderName,
        UUID printingId,
        UUID cardId,
        String cardName,
        String game,
        int quantity,
        String condition,
        String language,
        String edition,
        String finish,
        @Nullable BigDecimal askingPrice,
        String currency,
        Availability availability,
        boolean acceptsOffers,
        String notes,
        String publicNotes,
        ListingVisibility visibility,
        @Nullable Instant publicUntil,
        FreshnessState freshnessState,
        Instant confirmedAt,
        Instant createdAt,
        Instant updatedAt,
        boolean effectivePublic) {}
