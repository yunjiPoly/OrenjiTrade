package com.orenjitrade.api.inventory.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.inventory.domain.InventoryService.AdminChange;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.AdminRow;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin console "Listings" and "Auto-Delist Rules" review (Phase 7 contract): listings (items their
 * owners made public), stale and hidden listings for review, admin restore ({@value
 * #ACTION_RESTORE}) and admin hide ({@value #ACTION_HIDE}, the item becomes PRIVATE), both audited.
 * Private owner notes never leave this service.
 */
@Service
public class AdminListingService {

    public static final String ACTION_RESTORE = "listing.restore";
    public static final String ACTION_HIDE = "listing.hide";
    public static final String TARGET_ITEM = "INVENTORY_ITEM";
    static final String NOT_FOUND = "Listing not found";

    private final InventoryItemRepository items;
    private final InventoryService inventory;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public AdminListingService(
            InventoryItemRepository items,
            InventoryService inventory,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.items = items;
        this.inventory = inventory;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    /** {@code GET /admin/listings}: listings, newest change first. */
    @Transactional(readOnly = true)
    public PageResponse<AdminRow> list(
            @Nullable String query,
            @Nullable FreshnessState state,
            @Nullable String game,
            @Nullable UUID ownerId,
            int page,
            int size) {
        InventoryItemRepository.AdminPage result =
                items.adminPage(state, game, ownerId, query, false, page, size, timeProvider.now());
        return PageResponse.of(result.rows(), page, size, result.total());
    }

    /**
     * {@code GET /admin/listings/stale}: STALE or HIDDEN listings (both without a state), oldest
     * confirmation first. {@code 400} for other states.
     */
    @Transactional(readOnly = true)
    public PageResponse<AdminRow> stale(@Nullable FreshnessState state, int page, int size) {
        if (state != null && state != FreshnessState.STALE && state != FreshnessState.HIDDEN) {
            throw ApiException.validation(
                    "Validation failed",
                    java.util.List.of(
                            new com.orenjitrade.api.common.ProblemFieldError(
                                    "state", "must be STALE or HIDDEN")));
        }
        InventoryItemRepository.AdminPage result =
                items.adminPage(state, null, null, null, true, page, size, timeProvider.now());
        return PageResponse.of(result.rows(), page, size, result.total());
    }

    /** {@code POST /admin/listings/{itemId}/restore}: the listing is confirmed again (audited). */
    @Transactional
    public AdminRow restore(AuthenticatedUser actor, UUID itemId) {
        AdminChange change =
                inventory
                        .restoreListing(itemId)
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("ownerId", change.ownerId().toString());
        details.put("previousState", change.previousFreshness());
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_RESTORE,
                TARGET_ITEM,
                itemId.toString(),
                details);
        return items.adminRow(itemId, timeProvider.now()).orElseThrow();
    }

    /** {@code POST /admin/listings/{itemId}/hide}: the item becomes PRIVATE (audited). */
    @Transactional
    public AdminRow hide(AuthenticatedUser actor, UUID itemId, String reason) {
        AdminChange change =
                inventory.hideListing(itemId).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("ownerId", change.ownerId().toString());
        details.put("previousVisibility", change.previousVisibility());
        details.put("reason", reason.strip());
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_HIDE,
                TARGET_ITEM,
                itemId.toString(),
                details);
        return items.adminRow(itemId, timeProvider.now()).orElseThrow();
    }
}
