package com.orenjitrade.api.cards.infra;

import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.CatalogCardRef;
import com.orenjitrade.api.cards.domain.CatalogPrintingRef;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.cards.domain.scan.ScanCatalogLookup;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The scan match's lookups on the catalog: the grouped code and card lookups of the inventory
 * import ({@link CatalogService#printingRefsByCodes}, {@link CatalogService#printingRefsOfCards}),
 * the name search of {@code /cards/suggest} for every name read at once, and the cards' summaries
 * (pictures resolved through {@code CardImageUrlResolver}, ADR 0015).
 */
@Component
class CatalogScanLookup implements ScanCatalogLookup {

    private final CatalogService catalog;
    private final CatalogQueryRepository queries;
    private final CardScanQueryRepository scanQueries;

    CatalogScanLookup(
            CatalogService catalog,
            CatalogQueryRepository queries,
            CardScanQueryRepository scanQueries) {
        this.catalog = catalog;
        this.queries = queries;
        this.scanQueries = scanQueries;
    }

    @Override
    public Map<String, List<CatalogPrintingRef>> printingsByCodes(Collection<String> codes) {
        return catalog.printingRefsByCodes(codes);
    }

    @Override
    public List<CatalogCardRef> cardsByNames(UUID gameId, List<String> names, int perName) {
        return scanQueries.cardsByNames(gameId, names, perName);
    }

    @Override
    public Map<UUID, List<CatalogPrintingRef>> printingsOfCards(Collection<UUID> cardIds) {
        return catalog.printingRefsOfCards(cardIds);
    }

    @Override
    public Map<UUID, CardSummary> cards(Collection<UUID> cardIds) {
        Map<UUID, CardSummary> cards = new LinkedHashMap<>();
        for (CardSummary card : queries.findCardSummaries(List.copyOf(cardIds), true)) {
            cards.put(card.id(), card);
        }
        return cards;
    }

    @Override
    public Set<String> knownSetCodes(UUID gameId, Collection<String> setCodes) {
        return scanQueries.knownSetCodes(gameId, setCodes);
    }
}
