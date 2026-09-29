package com.orenjitrade.api.binders.domain;

import com.orenjitrade.api.delisting.domain.FreshnessState;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A binder as read from the database, with its live effective public visibility.
 *
 * @param id binder id
 * @param ownerId owner account
 * @param name name (1-80 characters)
 * @param description description (at most 1 000 characters)
 * @param kind purpose
 * @param visibility the owner's choice
 * @param publicUntil end of a TEMPORARILY_PUBLIC publication
 * @param sortOrder position in the owner's list
 * @param coverPrintingId printing whose image is the cover, when chosen
 * @param itemCount non-deleted items (maintained by a trigger)
 * @param freshnessState derived freshness
 * @param confirmedAt last owner confirmation
 * @param createdAt creation
 * @param updatedAt last owner edit
 * @param lastOwnerActivityAt last owner activity on the binder or its items
 * @param effectivePublic whether the binder is public right now (rules of {@link
 *     PublicVisibilityRules})
 */
public record BinderView(
        UUID id,
        UUID ownerId,
        String name,
        String description,
        BinderKind kind,
        ListingVisibility visibility,
        @Nullable Instant publicUntil,
        int sortOrder,
        @Nullable UUID coverPrintingId,
        int itemCount,
        FreshnessState freshnessState,
        Instant confirmedAt,
        Instant createdAt,
        Instant updatedAt,
        Instant lastOwnerActivityAt,
        boolean effectivePublic) {}
