package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.binders.domain.PublicBinderService;
import com.orenjitrade.api.binders.domain.PublicBinderService.PublicBinderHit;
import com.orenjitrade.api.binders.domain.PublicOwner;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.inventory.domain.InventoryItemView;
import com.orenjitrade.api.inventory.domain.PublicInventoryService;
import com.orenjitrade.api.wishlist.domain.WishlistService;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code GET /listings/owner} (stage R15 of the phone redesign, "Browse without an account"): who
 * owns a public card, binder or wish, for a member. A guest never sees who a collector is, so the
 * phone keeps a guest's action ("Message", "I have it", a post's header) by the item, binder or
 * wish it was about, never by a collector; once the guest has signed in, this names the collector
 * so the action can finish. It reveals nothing a member does not already read in card holders, a
 * public binder or Home's feed: the listing must be public right now and the owner visible to the
 * caller (no PRIVATE profile, no block in either direction).
 */
@Service
public class ListingOwnerService {

    static final String NOT_FOUND = "This listing is no longer available";

    private final PublicInventoryService publicInventoryService;
    private final PublicBinderService publicBinderService;
    private final WishlistService wishlistService;

    public ListingOwnerService(
            PublicInventoryService publicInventoryService,
            PublicBinderService publicBinderService,
            WishlistService wishlistService) {
        this.publicInventoryService = publicInventoryService;
        this.publicBinderService = publicBinderService;
        this.wishlistService = wishlistService;
    }

    /**
     * The owner of exactly one of a public inventory item, a public binder (a deck core too) or a
     * public wish; 400 when not exactly one is given, 404 when it is not public or not visible to
     * {@code viewerId}.
     */
    @Transactional(readOnly = true)
    public PublicOwner ownerOf(
            UUID viewerId, @Nullable UUID itemId, @Nullable UUID binderId, @Nullable UUID wishId) {
        int given =
                (itemId != null ? 1 : 0) + (binderId != null ? 1 : 0) + (wishId != null ? 1 : 0);
        if (given != 1) {
            List<ProblemFieldError> errors = new ArrayList<>();
            errors.add(new ProblemFieldError("itemId", "exactly one of itemId, binderId, wishId"));
            throw ApiException.validation("Validation failed", errors);
        }
        Optional<PublicOwner> owner;
        if (itemId != null) {
            owner =
                    publicInventoryService.publicItems(List.of(itemId)).stream()
                            .findFirst()
                            .map(InventoryItemView::row)
                            .flatMap(
                                    row ->
                                            publicBinderService.visibleOwner(
                                                    viewerId, row.ownerId()));
        } else if (binderId != null) {
            owner =
                    publicBinderService.publicBinders(viewerId, List.of(binderId)).stream()
                            .findFirst()
                            .map(PublicBinderHit::owner)
                            .flatMap(
                                    found ->
                                            publicBinderService.visibleOwner(viewerId, found.id()));
        } else {
            owner =
                    wishlistService
                            .visibleOwnerOf(viewerId, java.util.Objects.requireNonNull(wishId))
                            .flatMap(
                                    ownerId -> publicBinderService.visibleOwner(viewerId, ownerId));
        }
        return owner.orElseThrow(() -> ApiException.notFound(NOT_FOUND));
    }
}
