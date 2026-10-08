package com.orenjitrade.api.wishlist.domain;

import com.orenjitrade.api.billing.domain.Limits;
import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.games.domain.GameSchema;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import com.orenjitrade.api.inventory.domain.InventoryItemView;
import com.orenjitrade.api.inventory.domain.PublicInventoryService;
import com.orenjitrade.api.profiles.domain.BlockRelationProvider;
import com.orenjitrade.api.profiles.domain.PrivacyPolicyService;
import com.orenjitrade.api.profiles.domain.PrivacySettingsService;
import com.orenjitrade.api.profiles.domain.PrivacySettingsView;
import com.orenjitrade.api.profiles.domain.ViewerContext;
import com.orenjitrade.api.search.domain.CollectorDiscoveryService;
import com.orenjitrade.api.search.domain.CollectorMarker;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import com.orenjitrade.api.wishlist.domain.WishlistChanges.NewWishlistItem;
import com.orenjitrade.api.wishlist.domain.WishlistChanges.WishlistPatch;
import com.orenjitrade.api.wishlist.domain.WishlistItemView.CardRef;
import com.orenjitrade.api.wishlist.events.WishlistItemCreated;
import com.orenjitrade.api.wishlist.infra.WishlistMatchRepository;
import com.orenjitrade.api.wishlist.infra.WishlistMatchRepository.MatchRow;
import com.orenjitrade.api.wishlist.infra.WishlistRepository;
import com.orenjitrade.api.wishlist.infra.WishlistRepository.Values;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The caller's wishlist (Phase 6 contract): items for a card (any printing) or one printing, with
 * rarity / condition / edition / language filters validated against the game's {@code GameSchema},
 * a maximum price and a trade preference; {@code wishlist.items.max} limits the number of items
 * (429); exact duplicates are 409. Matching compares platform regions (ADR 0017): no radius, no
 * distance. Creating or editing an item matches it against the current public inventory right away
 * (no notification); new publications are matched by {@link WishlistMatcher}. Matches are served
 * with the public item and the owner's marker (state/province and country) only. The public summary
 * of {@code GET /collectors/{handle}/wishlist} follows {@link PrivacyPolicyService#canSeeWishlist}.
 */
@Service
public class WishlistService {

    public static final String ITEMS_MAX = "wishlist.items.max";
    public static final int NOTES_MAX = 500;
    public static final int MATCHES_DEFAULT_LIMIT = 20;
    public static final int MATCHES_MAX_LIMIT = 50;
    static final BigDecimal MAX_PRICE = new BigDecimal("9999999999.99");
    static final Pattern CURRENCY = Pattern.compile("^[A-Z]{3}$");
    static final String NOT_FOUND = "Wishlist item not found";
    static final String MATCH_NOT_FOUND = "Match not found";
    static final String WISHLIST_NOT_FOUND = "Wishlist not found";

    /** PATCH members that change what matches. */
    static final Set<String> CRITERIA =
            Set.of(
                    "printingId",
                    "rarity",
                    "conditionMin",
                    "edition",
                    "language",
                    "maxPrice",
                    "currency",
                    "tradePreference",
                    "active");

    private final WishlistRepository repository;
    private final WishlistMatchRepository matchRepository;
    private final WishlistMatcher matcher;
    private final CatalogService catalog;
    private final GameService games;
    private final Limits limits;
    private final PublicInventoryService publicInventory;
    private final CollectorDiscoveryService discovery;
    private final UserAccountService accounts;
    private final PrivacySettingsService privacySettings;
    private final PrivacyPolicyService privacyPolicy;
    private final ObjectProvider<BlockRelationProvider> blocks;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;

    public WishlistService(
            WishlistRepository repository,
            WishlistMatchRepository matchRepository,
            WishlistMatcher matcher,
            CatalogService catalog,
            GameService games,
            Limits limits,
            PublicInventoryService publicInventory,
            CollectorDiscoveryService discovery,
            UserAccountService accounts,
            PrivacySettingsService privacySettings,
            PrivacyPolicyService privacyPolicy,
            ObjectProvider<BlockRelationProvider> blocks,
            ApplicationEventPublisher events,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.matchRepository = matchRepository;
        this.matcher = matcher;
        this.catalog = catalog;
        this.games = games;
        this.limits = limits;
        this.publicInventory = publicInventory;
        this.discovery = discovery;
        this.accounts = accounts;
        this.privacySettings = privacySettings;
        this.privacyPolicy = privacyPolicy;
        this.blocks = blocks;
        this.events = events;
        this.timeProvider = timeProvider;
    }

    // ---------------------------------------------------------------------------------------
    // Owner CRUD
    // ---------------------------------------------------------------------------------------

    /** {@code GET /wishlist}: the caller's items, newest first. */
    @Transactional(readOnly = true)
    public List<WishlistItemView> list(UUID ownerId) {
        return views(repository.findByOwner(ownerId));
    }

    @Transactional(readOnly = true)
    public WishlistItemView get(UUID ownerId, UUID id) {
        return views(List.of(requireOwned(ownerId, id))).get(0);
    }

    /** {@code POST /wishlist}. */
    @Transactional
    public WishlistItemView create(UUID ownerId, NewWishlistItem input) {
        List<ProblemFieldError> errors = new ArrayList<>();
        @Nullable Target target = target(input.cardId(), input.printingId(), errors);
        String currency = currency(input.currency(), errors);
        String notes = notes(input.notes(), errors);
        validatePrice(input.maxPrice(), errors);
        @Nullable Filters filters =
                target == null
                        ? null
                        : filters(
                                target.schema(),
                                input.rarity(),
                                input.conditionMin(),
                                input.edition(),
                                input.language(),
                                errors);
        if (!errors.isEmpty() || target == null || filters == null) {
            throw ApiException.validation("Validation failed", errors);
        }
        Values values =
                new Values(
                        ownerId,
                        target.game(),
                        target.cardId(),
                        target.printingId(),
                        filters.rarity(),
                        filters.conditionMin(),
                        filters.edition(),
                        filters.language(),
                        input.maxPrice(),
                        currency,
                        input.tradePreference() == null
                                ? TradePreference.ANY
                                : input.tradePreference(),
                        notes,
                        input.active() == null || input.active());
        if (repository.existsSameWish(values, null)) {
            throw ApiException.conflict(
                    "This card is already on your wishlist with the same filters");
        }
        limits.consume(ownerId, ITEMS_MAX);
        UUID id = UUID.randomUUID();
        Instant now = timeProvider.now();
        repository.insert(id, values, now);
        if (values.active()) {
            matcher.matchWishlistItem(id);
        }
        events.publishEvent(
                new WishlistItemCreated(
                        id,
                        ownerId,
                        values.gameSlug(),
                        values.printingId() != null ? "printing" : "card",
                        values.maxPrice() != null,
                        values.tradePreference().name(),
                        now));
        return get(ownerId, id);
    }

    /** {@code PATCH /wishlist/{id}}: absent fields are unchanged. */
    @Transactional
    public WishlistItemView update(UUID ownerId, UUID id, WishlistPatch patch) {
        WishlistItemRow row = requireOwned(ownerId, id);
        List<ProblemFieldError> errors = new ArrayList<>();
        @Nullable GameSchema schema = games.find(row.gameSlug()).map(GameView::schema).orElse(null);
        UUID cardId = Objects.requireNonNull(row.cardId());
        @Nullable UUID printingId = row.printingId();
        if (patch.has("printingId")) {
            printingId = patch.printingId();
            if (printingId != null) {
                List<PrintingSummary> found = catalog.printings(List.of(printingId));
                if (found.isEmpty()) {
                    errors.add(new ProblemFieldError("printingId", "unknown printing"));
                } else if (!found.get(0).cardId().equals(cardId)) {
                    errors.add(
                            new ProblemFieldError(
                                    "printingId", "must be a printing of the wished card"));
                }
            }
        }
        String currency =
                patch.has("currency") ? currency(patch.currency(), errors) : row.currency();
        @Nullable BigDecimal maxPrice = patch.has("maxPrice") ? patch.maxPrice() : row.maxPrice();
        validatePrice(maxPrice, errors);
        String notes = patch.has("notes") ? notes(patch.notes(), errors) : row.notes();
        @Nullable Filters filters =
                schema == null
                        ? new Filters(
                                row.rarity(), row.conditionMin(), row.edition(), row.language())
                        : filters(
                                schema,
                                patch.has("rarity") ? patch.rarity() : row.rarity(),
                                patch.has("conditionMin")
                                        ? patch.conditionMin()
                                        : row.conditionMin(),
                                patch.has("edition") ? patch.edition() : row.edition(),
                                patch.has("language") ? patch.language() : row.language(),
                                errors);
        if (!errors.isEmpty() || filters == null) {
            throw ApiException.validation("Validation failed", errors);
        }
        Values values =
                new Values(
                        ownerId,
                        row.gameSlug(),
                        cardId,
                        printingId,
                        filters.rarity(),
                        filters.conditionMin(),
                        filters.edition(),
                        filters.language(),
                        maxPrice,
                        currency,
                        patch.has("tradePreference") && patch.tradePreference() != null
                                ? patch.tradePreference()
                                : row.tradePreference(),
                        notes,
                        patch.has("active") && patch.active() != null
                                ? patch.active()
                                : row.active());
        if (repository.existsSameWish(values, id)) {
            throw ApiException.conflict(
                    "This card is already on your wishlist with the same filters");
        }
        repository.update(id, values, timeProvider.now());
        boolean criteriaChanged = patch.present().stream().anyMatch(CRITERIA::contains);
        if (criteriaChanged && values.active()) {
            List<UUID> keep = matcher.matchWishlistItem(id);
            matchRepository.deleteUndismissedExcept(id, keep);
        }
        return get(ownerId, id);
    }

    /** {@code DELETE /wishlist/{id}} (its matches go with it). */
    @Transactional
    public void delete(UUID ownerId, UUID id) {
        if (repository.delete(ownerId, id) == 0) {
            throw ApiException.notFound(NOT_FOUND);
        }
    }

    // ---------------------------------------------------------------------------------------
    // Matches
    // ---------------------------------------------------------------------------------------

    /**
     * {@code GET /wishlist/{id}/matches}: newest first; items that stopped being public and owners
     * blocked in either direction or no longer discoverable are left out.
     */
    @Transactional(readOnly = true)
    public CursorPage<WishlistMatchView> matches(
            UUID ownerId,
            UUID wishlistItemId,
            @Nullable String cursor,
            int limit,
            boolean includeDismissed) {
        requireOwned(ownerId, wishlistItemId);
        @Nullable TimeCursor after = TimeCursor.decode(cursor);
        List<MatchRow> rows =
                matchRepository.page(wishlistItemId, includeDismissed, after, limit + 1);
        boolean more = rows.size() > limit;
        List<MatchRow> slice = more ? rows.subList(0, limit) : rows;
        Map<UUID, InventoryItemView> items = new HashMap<>();
        for (InventoryItemView item :
                publicInventory.publicItems(
                        slice.stream().map(MatchRow::inventoryItemId).toList())) {
            items.put(item.row().id(), item);
        }
        Map<UUID, CollectorMarker> markers =
                discovery.markersFor(
                        ownerId,
                        new LinkedHashSet<>(slice.stream().map(MatchRow::itemOwnerId).toList()));
        List<WishlistMatchView> views = new ArrayList<>();
        for (MatchRow row : slice) {
            @Nullable InventoryItemView item = items.get(row.inventoryItemId());
            @Nullable CollectorMarker marker = markers.get(row.itemOwnerId());
            if (item == null || marker == null) {
                continue;
            }
            views.add(
                    new WishlistMatchView(
                            row.id(),
                            row.wishlistItemId(),
                            item,
                            marker,
                            row.matchedAt(),
                            row.dismissed()));
        }
        if (!more) {
            return CursorPage.last(views);
        }
        MatchRow last = slice.get(slice.size() - 1);
        return CursorPage.of(views, new TimeCursor(last.matchedAt(), last.id()).encode());
    }

    /** {@code POST /wishlist/matches/{id}/dismiss}: idempotent; 404 for others' matches. */
    @Transactional
    public void dismiss(UUID ownerId, UUID matchId) {
        UUID owner =
                matchRepository
                        .ownerOfMatch(matchId)
                        .orElseThrow(() -> ApiException.notFound(MATCH_NOT_FOUND));
        if (!owner.equals(ownerId)) {
            throw ApiException.notFound(MATCH_NOT_FOUND);
        }
        matchRepository.dismiss(matchId);
    }

    // ---------------------------------------------------------------------------------------
    // Public summary
    // ---------------------------------------------------------------------------------------

    /**
     * {@code GET /collectors/{handle}/wishlist}: the active items (card, printing, minimum
     * condition only) when the collector shows their wishlist; 404 otherwise (unknown, suspended,
     * pending deletion, hidden wishlist, profile not visible, block).
     */
    @Transactional(readOnly = true)
    public List<WishlistItemView> publicSummary(@Nullable UUID viewerId, String handle) {
        Instant now = timeProvider.now();
        UserAccountSnapshot account =
                accounts.findByHandle(handle)
                        .filter(candidate -> isPubliclyVisible(candidate, now))
                        .orElseThrow(() -> ApiException.notFound(WISHLIST_NOT_FOUND));
        UUID targetId = account.id();
        PrivacySettingsView privacy = privacySettings.settingsOf(targetId);
        boolean blocked = false;
        if (viewerId != null && !viewerId.equals(targetId)) {
            @Nullable BlockRelationProvider provider = blocks.getIfAvailable();
            blocked = provider != null && provider.isBlocked(viewerId, targetId);
        }
        if (!privacyPolicy.canSeeWishlist(
                new ViewerContext(viewerId, false, blocked), targetId, privacy)) {
            throw ApiException.notFound(WISHLIST_NOT_FOUND);
        }
        return views(repository.findActiveByOwner(targetId));
    }

    // ---------------------------------------------------------------------------------------
    // Account data
    // ---------------------------------------------------------------------------------------

    /** Export section {@code wishlist}: every item with its private notes (the owner's data). */
    @Transactional(readOnly = true)
    public List<Map<String, @Nullable Object>> export(UUID ownerId) {
        List<Map<String, @Nullable Object>> result = new ArrayList<>();
        for (WishlistItemView view : list(ownerId)) {
            WishlistItemRow row = view.row();
            Map<String, @Nullable Object> entry = new LinkedHashMap<>();
            entry.put("id", row.id());
            entry.put("game", row.gameSlug());
            entry.put("cardId", row.cardId());
            entry.put("cardName", view.card() == null ? null : view.card().name());
            entry.put("printingId", row.printingId());
            entry.put("rarity", row.rarity());
            entry.put("conditionMin", row.conditionMin());
            entry.put("edition", row.edition());
            entry.put("language", row.language());
            entry.put("maxPrice", row.maxPrice());
            entry.put("currency", row.currency());
            entry.put("tradePreference", row.tradePreference().name());
            entry.put("notes", row.notes());
            entry.put("active", row.active());
            entry.put("createdAt", row.createdAt());
            entry.put("updatedAt", row.updatedAt());
            result.add(entry);
        }
        return result;
    }

    /** Deletes the owner's items and their matches (account deletion). */
    @Transactional
    public void purge(UUID ownerId) {
        repository.deleteByOwner(ownerId);
    }

    /** Number of items of the owner ({@code wishlist.items.max} usage). */
    @Transactional(readOnly = true)
    public long countOf(UUID ownerId) {
        return repository.countByOwner(ownerId);
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private WishlistItemRow requireOwned(UUID ownerId, UUID id) {
        return repository
                .find(id)
                .filter(row -> row.ownerId().equals(ownerId))
                .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
    }

    private List<WishlistItemView> views(List<WishlistItemRow> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Set<UUID> cardIds = new LinkedHashSet<>();
        Set<UUID> printingIds = new LinkedHashSet<>();
        for (WishlistItemRow row : rows) {
            if (row.cardId() != null) {
                cardIds.add(row.cardId());
            }
            if (row.printingId() != null) {
                printingIds.add(row.printingId());
            }
        }
        Map<UUID, CardSummary> cards = catalog.cardSummariesIncludingHidden(cardIds);
        Map<UUID, PrintingSummary> printings = new HashMap<>();
        for (PrintingSummary printing : catalog.printingsIncludingHidden(printingIds)) {
            printings.put(printing.id(), printing);
        }
        List<WishlistItemView> views = new ArrayList<>();
        for (WishlistItemRow row : rows) {
            @Nullable CardSummary card = row.cardId() == null ? null : cards.get(row.cardId());
            views.add(
                    new WishlistItemView(
                            row,
                            card == null
                                    ? null
                                    : new CardRef(card.id(), card.name(), card.primaryImageUrl()),
                            row.printingId() == null ? null : printings.get(row.printingId())));
        }
        return views;
    }

    /** Resolves the wished card and printing (400 for unknown ones or hidden games). */
    private @Nullable Target target(
            @Nullable UUID cardId, @Nullable UUID printingId, List<ProblemFieldError> errors) {
        if (cardId == null && printingId == null) {
            errors.add(new ProblemFieldError("cardId", "cardId or printingId is required"));
            return null;
        }
        UUID resolvedCard = cardId;
        if (printingId != null) {
            List<PrintingSummary> found = catalog.printings(List.of(printingId));
            if (found.isEmpty()) {
                errors.add(new ProblemFieldError("printingId", "unknown printing"));
                return null;
            }
            if (cardId != null && !found.get(0).cardId().equals(cardId)) {
                errors.add(new ProblemFieldError("printingId", "must be a printing of the card"));
                return null;
            }
            resolvedCard = found.get(0).cardId();
        }
        @Nullable CardSummary card =
                catalog.cardSummariesIncludingHidden(List.of(Objects.requireNonNull(resolvedCard)))
                        .get(resolvedCard);
        @Nullable GameView game =
                card == null
                        ? null
                        : games.find(card.game()).filter(GameView::isActive).orElse(null);
        if (card == null || game == null) {
            errors.add(new ProblemFieldError("cardId", "unknown card"));
            return null;
        }
        return new Target(game.slug(), card.id(), printingId, game.schema());
    }

    private static @Nullable Filters filters(
            GameSchema schema,
            @Nullable String rarity,
            @Nullable String conditionMin,
            @Nullable String edition,
            @Nullable String language,
            List<ProblemFieldError> errors) {
        int before = errors.size();
        @Nullable String rarityValue = blankToNull(rarity);
        if (rarityValue != null && !schema.rarities().contains(rarityValue)) {
            errors.add(new ProblemFieldError("rarity", "not a rarity of this game"));
        }
        @Nullable String condition = upper(conditionMin);
        if (condition != null && !schema.conditions().contains(condition)) {
            errors.add(new ProblemFieldError("conditionMin", "not a condition of this game"));
        }
        @Nullable String editionValue = upper(edition);
        if (editionValue != null && !schema.editions().contains(editionValue)) {
            errors.add(new ProblemFieldError("edition", "not an edition of this game"));
        }
        @Nullable String languageValue = blankToNull(language);
        if (languageValue != null) {
            languageValue = languageValue.toLowerCase(Locale.ROOT);
            if (!schema.languages().contains(languageValue)) {
                errors.add(new ProblemFieldError("language", "not a language of this game"));
            }
        }
        if (errors.size() > before) {
            return null;
        }
        return new Filters(rarityValue, condition, editionValue, languageValue);
    }

    private static String currency(@Nullable String currency, List<ProblemFieldError> errors) {
        if (currency == null || currency.isBlank()) {
            return "CAD";
        }
        String value = currency.trim().toUpperCase(Locale.ROOT);
        if (!CURRENCY.matcher(value).matches()) {
            errors.add(new ProblemFieldError("currency", "must be an ISO 4217 code"));
        }
        return value;
    }

    private static String notes(@Nullable String notes, List<ProblemFieldError> errors) {
        String value = notes == null ? "" : notes.strip();
        if (value.length() > NOTES_MAX) {
            errors.add(new ProblemFieldError("notes", "at most " + NOTES_MAX + " characters"));
        }
        return value;
    }

    private static void validatePrice(@Nullable BigDecimal price, List<ProblemFieldError> errors) {
        if (price == null) {
            return;
        }
        if (price.signum() < 0 || price.compareTo(MAX_PRICE) > 0) {
            errors.add(new ProblemFieldError("maxPrice", "must be between 0 and " + MAX_PRICE));
        } else if (price.stripTrailingZeros().scale() > 2) {
            errors.add(new ProblemFieldError("maxPrice", "at most 2 decimals"));
        }
    }

    private static @Nullable String upper(@Nullable String value) {
        @Nullable String text = blankToNull(value);
        return text == null ? null : text.toUpperCase(Locale.ROOT);
    }

    private static @Nullable String blankToNull(@Nullable String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** Active accounts, including those whose temporary suspension has already ended. */
    static boolean isPubliclyVisible(UserAccountSnapshot account, Instant now) {
        return switch (account.status()) {
            case ACTIVE -> true;
            case SUSPENDED -> !account.isSuspendedAt(now);
            case DELETION_REQUESTED, DELETED -> false;
        };
    }

    /** The resolved card of a new item. */
    private record Target(String game, UUID cardId, @Nullable UUID printingId, GameSchema schema) {}

    /** Validated filter values. */
    private record Filters(
            @Nullable String rarity,
            @Nullable String conditionMin,
            @Nullable String edition,
            @Nullable String language) {}
}
