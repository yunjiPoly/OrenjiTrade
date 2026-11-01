package com.orenjitrade.api.cards.domain.scan;

import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.CatalogCardRef;
import com.orenjitrade.api.cards.domain.CatalogPrintingRef;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The text matcher of the camera scan (owner spec 2026-10-15, section 3.5): the name and set code
 * the phone read, matched against the catalog in at most five grouped queries (the codes with all
 * their forms and variants, the names, the candidate cards' printings, their summaries and
 * pictures; a sixth, the sets, only for a code read in doubt between English and another language),
 * then decided by {@link ScanRules}. Yu-Gi-Oh! English cards only.
 *
 * <p>Privacy: what was read is never logged (only the status and how many codes and names were
 * read, without the caller).
 */
@Service
public class TextCardMatcher implements CardMatcher {

    /** The one game the scan reads. */
    public static final String GAME = "yugioh";

    /** Cards the name lookup keeps per name read. */
    static final int NAME_CANDIDATES = 8;

    private static final Logger log = LoggerFactory.getLogger(TextCardMatcher.class);

    private final ScanCatalogLookup lookup;
    private final GameService games;

    public TextCardMatcher(ScanCatalogLookup lookup, GameService games) {
        this.lookup = lookup;
        this.games = games;
    }

    @Override
    @Transactional(readOnly = true)
    public ScanMatch match(ScanQuery query) {
        GameView game = requireGame(query.game());
        ScanRules.Evidence evidence = ScanRules.evidence(query.codes(), query.names());
        ScanRules.Catalog catalog;
        Map<UUID, CardSummary> cards;
        if (evidence.otherLanguage()) {
            // English cards only: nothing is looked up for a read of another language.
            catalog = ScanRules.Catalog.empty();
            cards = Map.of();
        } else {
            Set<String> codes = ScanRules.codesToLookUp(evidence);
            Map<String, List<CatalogPrintingRef>> byCode =
                    codes.isEmpty() ? Map.of() : lookup.printingsByCodes(codes);
            List<CatalogCardRef> named =
                    evidence.names().isEmpty()
                            ? List.of()
                            : lookup.cardsByNames(game.id(), evidence.names(), NAME_CANDIDATES);
            Set<UUID> cardIds = new LinkedHashSet<>();
            byCode.values()
                    .forEach(
                            refs ->
                                    refs.forEach(
                                            ref -> {
                                                if (GAME.equals(ref.game())) {
                                                    cardIds.add(ref.cardId());
                                                }
                                            }));
            named.forEach(card -> cardIds.add(card.id()));
            Map<UUID, List<CatalogPrintingRef>> byCard =
                    cardIds.isEmpty() ? Map.of() : lookup.printingsOfCards(cardIds);
            cards = cardIds.isEmpty() ? Map.of() : lookup.cards(cardIds);
            Map<UUID, String> names = new LinkedHashMap<>();
            cards.forEach((id, card) -> names.put(id, card.name()));
            Set<String> sets = ScanRules.setsToLookUp(evidence);
            catalog =
                    ScanRules.Catalog.of(
                            GAME,
                            byCode,
                            byCard,
                            names,
                            named.stream().map(CatalogCardRef::id).toList(),
                            sets.isEmpty() ? Set.of() : lookup.knownSetCodes(game.id(), sets));
        }
        ScanRules.Decision decision = ScanRules.decide(evidence, catalog);
        log.debug(
                "Card scan match {} ({} codes, {} names read)",
                decision.status(),
                evidence.codes().size(),
                evidence.names().size());
        return answer(decision, catalog, cards, evidence.read());
    }

    /** 400 for every game but Yu-Gi-Oh! (and while an admin hides it). */
    private GameView requireGame(@Nullable String slug) {
        String game = slug == null ? "" : slug.trim().toLowerCase(Locale.ROOT);
        if (!GAME.equals(game)) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    "game",
                                    "must be yugioh: the scan reads Yu-Gi-Oh! cards only")));
        }
        Optional<GameView> view = games.find(GAME).filter(GameView::isActive);
        if (view.isEmpty()) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("game", "is not available")));
        }
        return view.get();
    }

    /** The answer of a decision. */
    static ScanMatch answer(
            ScanRules.Decision decision,
            ScanRules.Catalog catalog,
            Map<UUID, CardSummary> cards,
            ScanMatch.Read read) {
        @Nullable UUID cardId = decision.cardId();
        List<CatalogPrintingRef> ofCard = cardId == null ? List.of() : catalog.printingsOf(cardId);
        ScanMatch.@Nullable Card card = cardId == null ? null : card(cardId, cards);
        ScanMatch.@Nullable Printing printing =
                decision.printingId() == null
                        ? null
                        : ofCard.stream()
                                .filter(ref -> ref.id().equals(decision.printingId()))
                                .findFirst()
                                .map(TextCardMatcher::printing)
                                .orElse(null);
        List<ScanMatch.Printing> rarities =
                decision.status() == ScanStatus.PICK_RARITY
                        ? ofCard.stream()
                                .filter(ref -> ref.printingCode().equals(decision.code()))
                                .map(TextCardMatcher::printing)
                                .toList()
                        : List.of();
        List<ScanMatch.OtherMatch> others =
                decision.others().stream()
                        .filter(other -> cards.containsKey(other.cardId()))
                        .map(other -> otherMatch(other, catalog, cards))
                        .toList();
        return new ScanMatch(
                decision.status(),
                decision.reason(),
                card,
                printing,
                rarities,
                ofCard.stream().map(TextCardMatcher::printing).toList(),
                others,
                read);
    }

    private static ScanMatch.@Nullable Card card(UUID cardId, Map<UUID, CardSummary> cards) {
        CardSummary summary = cards.get(cardId);
        return summary == null
                ? null
                : new ScanMatch.Card(summary.id(), summary.name(), summary.primaryImageUrl());
    }

    private static ScanMatch.Printing printing(CatalogPrintingRef ref) {
        return new ScanMatch.Printing(
                ref.id(), ref.printingCode(), ref.setCode(), ref.setName(), ref.rarity());
    }

    private static ScanMatch.OtherMatch otherMatch(
            ScanRules.Other other, ScanRules.Catalog catalog, Map<UUID, CardSummary> cards) {
        CardSummary summary = cards.get(other.cardId());
        List<CatalogPrintingRef> ofCode =
                other.code() == null
                        ? List.of()
                        : catalog.printingsOf(other.cardId()).stream()
                                .filter(ref -> other.code().equals(ref.printingCode()))
                                .toList();
        @Nullable CatalogPrintingRef only = ofCode.size() == 1 ? ofCode.get(0) : null;
        return new ScanMatch.OtherMatch(
                other.cardId(),
                summary.name(),
                summary.primaryImageUrl(),
                other.kind(),
                other.code(),
                ofCode.isEmpty() ? null : ofCode.get(0).setName(),
                only == null ? null : only.id(),
                only == null ? null : only.rarity());
    }
}
