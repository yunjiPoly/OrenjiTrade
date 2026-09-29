package com.orenjitrade.api.inventory.domain;

import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.domain.BinderView;
import com.orenjitrade.api.binders.domain.PublicBinderService;
import com.orenjitrade.api.binders.domain.PublicOwner;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.inventory.domain.InventoryChanges.OwnerQuery;
import com.orenjitrade.api.inventory.domain.InventoryChanges.PublicQuery;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Public item lists (Phase 3 contract "Public views"): the effectively public items of a public
 * binder and of a collector. The rules of {@code PublicVisibilityRules} are evaluated in SQL for
 * every request; responses never carry private notes or coordinates. Also the owner's view of one
 * binder's items ({@code GET /binders/{id}/items}).
 */
@Service
public class PublicInventoryService {

    private final InventoryItemRepository items;
    private final InventoryService inventoryService;
    private final PublicBinderService publicBinderService;
    private final BinderService binderService;
    private final GameService games;
    private final TimeProvider timeProvider;

    public PublicInventoryService(
            InventoryItemRepository items,
            InventoryService inventoryService,
            PublicBinderService publicBinderService,
            BinderService binderService,
            GameService games,
            TimeProvider timeProvider) {
        this.items = items;
        this.inventoryService = inventoryService;
        this.publicBinderService = publicBinderService;
        this.binderService = binderService;
        this.games = games;
        this.timeProvider = timeProvider;
    }

    /** {@code GET /public/binders/{id}/items} ({@code 404} unless the binder is public). */
    @Transactional(readOnly = true)
    public PageResponse<InventoryItemView> binderItems(
            @Nullable UUID viewerId, UUID binderId, PublicQuery query) {
        validateGame(query.game());
        BinderView binder = publicBinderService.requirePublicBinder(viewerId, binderId);
        return page(items.publicPage(binder.id(), null, query, timeProvider.now()), query);
    }

    /** {@code GET /collectors/{handle}/inventory} ({@code 404} for hidden collectors). */
    @Transactional(readOnly = true)
    public PageResponse<InventoryItemView> collectorItems(
            @Nullable UUID viewerId, String handle, PublicQuery query) {
        validateGame(query.game());
        PublicOwner owner = publicBinderService.requireOwner(viewerId, handle);
        return page(items.publicPage(null, owner.id(), query, timeProvider.now()), query);
    }

    /** {@code GET /binders/{id}/items}: every item of one of the caller's binders. */
    @Transactional(readOnly = true)
    public PageResponse<InventoryItemView> ownerBinderItems(
            UUID ownerId, UUID binderId, OwnerQuery query) {
        binderService.requireOwned(ownerId, binderId);
        return inventoryService.list(ownerId, query);
    }

    private PageResponse<InventoryItemView> page(
            InventoryItemRepository.Page page, PublicQuery query) {
        List<InventoryItemView> views = inventoryService.views(page.rows());
        return PageResponse.of(views, query.page(), query.size(), page.total());
    }

    private void validateGame(@Nullable String game) {
        if (game != null && games.find(game).isEmpty()) {
            throw ApiException.validation(
                    "Validation failed", List.of(new ProblemFieldError("game", "unknown game")));
        }
    }
}
