package com.orenjitrade.api.wishlist.domain;

import com.orenjitrade.api.billing.domain.Limits;
import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import com.orenjitrade.api.moderation.domain.ModerationScope;
import com.orenjitrade.api.moderation.domain.ModerationVerdict;
import com.orenjitrade.api.moderation.domain.TextModerationService;
import com.orenjitrade.api.profiles.domain.BlockRelationProvider;
import com.orenjitrade.api.profiles.domain.PrivacyPolicyService;
import com.orenjitrade.api.profiles.domain.PrivacySettingsService;
import com.orenjitrade.api.profiles.domain.PrivacySettingsView;
import com.orenjitrade.api.profiles.domain.ViewerContext;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import com.orenjitrade.api.wishlist.domain.WishlistChanges.NewWishlistItem;
import com.orenjitrade.api.wishlist.domain.WishlistChanges.WishlistPatch;
import com.orenjitrade.api.wishlist.domain.WishlistItemView.CardRef;
import com.orenjitrade.api.wishlist.events.WishlistItemCreated;
import com.orenjitrade.api.wishlist.infra.WishlistAlertRepository;
import com.orenjitrade.api.wishlist.infra.WishlistRepository;
import com.orenjitrade.api.wishlist.infra.WishlistRepository.Values;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The caller's wishlist (stage S2 model, owner product change of 2026-10-08 section 4). A wish has
 * only: which copy (the card with any printing, optionally of one rarity of its printings, or one
 * printing), a public note (plain text, at most {@value #NOTE_MAX} characters, moderated like
 * profile text), "Near Mint only" and at most one price term from the admin list ({@link
 * WishlistSettings}; a display term, not a filter). {@code wishlist.items.max} limits the number of
 * wishes (429); the same selection twice is 409. Wishes drive no stored matches: {@link
 * WishlistAlerts} alerts collectors of the same platform region when a fitting item is listed. The
 * public summary of {@code GET /collectors/{handle}/wishlist} follows {@link
 * PrivacyPolicyService#canSeeWishlist}.
 */
@Service
public class WishlistService {

    public static final String ITEMS_MAX = "wishlist.items.max";
    public static final int NOTE_MAX = 280;
    static final String NOT_FOUND = "Wishlist item not found";
    static final String WISHLIST_NOT_FOUND = "Wishlist not found";
    static final String DUPLICATE =
            "This card is already on your wishlist with the same printing or rarity";

    /** Control characters other than line feed and tab: a public note is plain text. */
    static final Pattern CONTROL = Pattern.compile("[\\p{Cc}&&[^\\n\\t]]");

    private static final Logger log = LoggerFactory.getLogger(WishlistService.class);

    private final WishlistRepository repository;
    private final WishlistAlertRepository alertRepository;
    private final WishlistSettings settings;
    private final CatalogService catalog;
    private final GameService games;
    private final Limits limits;
    private final TextModerationService moderation;
    private final UserAccountService accounts;
    private final PrivacySettingsService privacySettings;
    private final PrivacyPolicyService privacyPolicy;
    private final ObjectProvider<BlockRelationProvider> blocks;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;

    public WishlistService(
            WishlistRepository repository,
            WishlistAlertRepository alertRepository,
            WishlistSettings settings,
            CatalogService catalog,
            GameService games,
            Limits limits,
            TextModerationService moderation,
            UserAccountService accounts,
            PrivacySettingsService privacySettings,
            PrivacyPolicyService privacyPolicy,
            ObjectProvider<BlockRelationProvider> blocks,
            ApplicationEventPublisher events,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.alertRepository = alertRepository;
        this.settings = settings;
        this.catalog = catalog;
        this.games = games;
        this.limits = limits;
        this.moderation = moderation;
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
        String note = note(input.note(), errors);
        @Nullable String priceTerm = priceTerm(input.priceTerm(), errors);
        @Nullable String rarity = target == null ? null : rarity(target, input.rarity(), errors);
        if (!errors.isEmpty() || target == null) {
            throw ApiException.validation("Validation failed", errors);
        }
        Values values =
                new Values(
                        ownerId,
                        target.game(),
                        target.cardId(),
                        target.printing() == null ? null : target.printing().id(),
                        rarity,
                        note,
                        Boolean.TRUE.equals(input.nearMintOnly()),
                        priceTerm);
        if (repository.existsSameSelection(values, null)) {
            throw ApiException.conflict(DUPLICATE);
        }
        limits.consume(ownerId, ITEMS_MAX);
        UUID id = UUID.randomUUID();
        Instant now = timeProvider.now();
        try {
            repository.insert(id, values, now);
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict(DUPLICATE);
        }
        events.publishEvent(
                new WishlistItemCreated(
                        id,
                        ownerId,
                        values.gameSlug(),
                        values.printingId() != null
                                ? "printing"
                                : values.rarity() != null ? "rarity" : "card",
                        values.nearMintOnly(),
                        values.priceTerm() != null,
                        now));
        return get(ownerId, id);
    }

    /** {@code PATCH /wishlist/{id}}: absent fields are unchanged. */
    @Transactional
    public WishlistItemView update(UUID ownerId, UUID id, WishlistPatch patch) {
        WishlistItemRow row = requireOwned(ownerId, id);
        List<ProblemFieldError> errors = new ArrayList<>();
        UUID cardId = Objects.requireNonNull(row.cardId());
        @Nullable PrintingSummary printing = null;
        @Nullable UUID printingId = patch.has("printingId") ? patch.printingId() : row.printingId();
        if (printingId != null) {
            List<PrintingSummary> found = catalog.printingsIncludingHidden(List.of(printingId));
            if (found.isEmpty()) {
                errors.add(new ProblemFieldError("printingId", "unknown printing"));
            } else if (!found.get(0).cardId().equals(cardId)) {
                errors.add(
                        new ProblemFieldError(
                                "printingId", "must be a printing of the wished card"));
            } else {
                printing = found.get(0);
            }
        }
        String note = patch.has("note") ? note(patch.note(), errors) : row.publicNote();
        // A term the admin list no longer offers stays valid on the wish that chose it.
        @Nullable String priceTerm =
                !patch.has("priceTerm") || isUnchanged(patch.priceTerm(), row.priceTerm())
                        ? row.priceTerm()
                        : priceTerm(patch.priceTerm(), errors);
        @Nullable String rarity = null;
        if (errors.isEmpty()) {
            // A printing change clears a stored rarity unless the request sets one.
            @Nullable String requested =
                    patch.has("rarity")
                            ? patch.rarity()
                            : patch.has("printingId") ? null : row.rarity();
            rarity = rarity(new Target(row.gameSlug(), cardId, printing), requested, errors);
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        Values values =
                new Values(
                        ownerId,
                        row.gameSlug(),
                        cardId,
                        printingId,
                        rarity,
                        note,
                        patch.has("nearMintOnly") && patch.nearMintOnly() != null
                                ? patch.nearMintOnly()
                                : row.nearMintOnly(),
                        priceTerm);
        if (repository.existsSameSelection(values, id)) {
            throw ApiException.conflict(DUPLICATE);
        }
        try {
            repository.update(id, values, timeProvider.now());
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict(DUPLICATE);
        }
        return get(ownerId, id);
    }

    /** {@code DELETE /wishlist/{id}}. */
    @Transactional
    public void delete(UUID ownerId, UUID id) {
        if (repository.delete(ownerId, id) == 0) {
            throw ApiException.notFound(NOT_FOUND);
        }
    }

    /** {@code GET /wishlist/price-terms}: the terms a wish may choose, in display order. */
    public List<PriceTerm> priceTerms() {
        return settings.current().terms();
    }

    // ---------------------------------------------------------------------------------------
    // Public summary
    // ---------------------------------------------------------------------------------------

    /**
     * {@code GET /collectors/{handle}/wishlist}: every wish (which copy, public note, Near Mint
     * only, price term) when the collector shows their wishlist; 404 otherwise (unknown, suspended,
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
        return views(repository.findByOwner(targetId));
    }

    // ---------------------------------------------------------------------------------------
    // Account data
    // ---------------------------------------------------------------------------------------

    /** Export section {@code wishlist}: every wish of the owner. */
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
            entry.put("note", row.publicNote());
            entry.put("nearMintOnly", row.nearMintOnly());
            entry.put("priceTerm", row.priceTerm());
            entry.put("createdAt", row.createdAt());
            entry.put("updatedAt", row.updatedAt());
            result.add(entry);
        }
        return result;
    }

    /** Deletes the owner's wishes and sent-alert keys (account deletion). */
    @Transactional
    public void purge(UUID ownerId) {
        repository.deleteByOwner(ownerId);
        alertRepository.deleteSentOf(ownerId);
    }

    /** Number of items of the owner ({@code wishlist.items.max} usage). */
    @Transactional(readOnly = true)
    public long countOf(UUID ownerId) {
        return repository.countByOwner(ownerId);
    }

    // ---------------------------------------------------------------------------------------
    // Validation
    // ---------------------------------------------------------------------------------------

    /**
     * The public note as stored: trimmed, line breaks normalised; {@code ""} for none. A field
     * error when longer than {@value #NOTE_MAX} characters, not plain text (control characters) or
     * blocked by the moderation rules (PROFILE scope, like the bio); flagged text is accepted and
     * logged without the text.
     */
    String note(@Nullable String note, List<ProblemFieldError> errors) {
        String value = note == null ? "" : note.replace("\r\n", "\n").replace('\r', '\n').strip();
        if (value.isEmpty()) {
            return "";
        }
        if (value.codePointCount(0, value.length()) > NOTE_MAX) {
            errors.add(new ProblemFieldError("note", "at most " + NOTE_MAX + " characters"));
            return value;
        }
        if (CONTROL.matcher(value).find()) {
            errors.add(new ProblemFieldError("note", "must be plain text"));
            return value;
        }
        ModerationVerdict verdict = moderation.evaluate(ModerationScope.PROFILE, value);
        if (verdict.isBlocked()) {
            errors.add(new ProblemFieldError("note", "contains a term that is not allowed"));
        } else if (verdict == ModerationVerdict.FLAG) {
            log.info("Wishlist note flagged for review");
        }
        return value;
    }

    private static boolean isUnchanged(@Nullable String requested, @Nullable String stored) {
        return requested != null && stored != null && requested.strip().equals(stored);
    }

    /** One of the admin-configured terms ({@code null} for none), else a field error. */
    private @Nullable String priceTerm(@Nullable String value, List<ProblemFieldError> errors) {
        if (value == null || value.isBlank()) {
            return null;
        }
        Optional<PriceTerm> term = settings.current().find(value);
        if (term.isEmpty()) {
            errors.add(
                    new ProblemFieldError(
                            "priceTerm",
                            "must be one of "
                                    + String.join(", ", settings.current().priceTerms())));
            return null;
        }
        return term.get().label();
    }

    /**
     * The stored rarity: {@code null} for a one-printing wish (a rarity equal to the printing's is
     * accepted and dropped; another one is 400), else {@code null} or one of the rarities of the
     * card's printings (400 otherwise).
     */
    private @Nullable String rarity(
            Target target, @Nullable String value, List<ProblemFieldError> errors) {
        @Nullable String rarity = value == null || value.isBlank() ? null : value.strip();
        if (rarity == null) {
            return null;
        }
        if (target.printing() != null) {
            if (!rarity.equals(target.printing().rarity())) {
                errors.add(
                        new ProblemFieldError(
                                "rarity",
                                "a printing has its own rarity: leave rarity empty or choose any"
                                        + " printing"));
            }
            return null;
        }
        Set<String> rarities = new LinkedHashSet<>();
        for (PrintingSummary printing : printingsOf(target.cardId())) {
            if (printing.rarity() != null) {
                rarities.add(printing.rarity());
            }
        }
        if (!rarities.contains(rarity)) {
            errors.add(new ProblemFieldError("rarity", "not a rarity of this card's printings"));
            return null;
        }
        return rarity;
    }

    private List<PrintingSummary> printingsOf(UUID cardId) {
        try {
            return catalog.printingsOfCard(cardId);
        } catch (ApiException e) {
            return List.of();
        }
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
        @Nullable PrintingSummary printing = null;
        if (printingId != null) {
            List<PrintingSummary> found = catalog.printings(List.of(printingId));
            if (found.isEmpty()) {
                errors.add(new ProblemFieldError("printingId", "unknown printing"));
                return null;
            }
            printing = found.get(0);
            if (cardId != null && !printing.cardId().equals(cardId)) {
                errors.add(new ProblemFieldError("printingId", "must be a printing of the card"));
                return null;
            }
            resolvedCard = printing.cardId();
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
        return new Target(game.slug(), card.id(), printing);
    }

    /** Active accounts, including those whose temporary suspension has already ended. */
    static boolean isPubliclyVisible(UserAccountSnapshot account, Instant now) {
        return switch (account.status()) {
            case ACTIVE -> true;
            case SUSPENDED -> !account.isSuspendedAt(now);
            case DELETION_REQUESTED, DELETED -> false;
        };
    }

    /** The resolved card (and printing) of a wish. */
    private record Target(String game, UUID cardId, @Nullable PrintingSummary printing) {}
}
