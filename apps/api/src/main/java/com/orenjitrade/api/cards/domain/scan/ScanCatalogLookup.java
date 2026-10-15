package com.orenjitrade.api.cards.domain.scan;

import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.CatalogCardRef;
import com.orenjitrade.api.cards.domain.CatalogPrintingRef;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The grouped catalog lookups of a scan match: each is one query (two for {@link #cards}, whose
 * pictures are resolved together), whatever the number of codes, variants and names read; never one
 * query per variant. {@link #knownSetCodes} runs only for a code read in doubt. Implemented on the
 * catalog repositories; tests use an in-memory catalog.
 */
public interface ScanCatalogLookup {

    /** Printings of ACTIVE games by exact printing code (upper case), by code. */
    Map<String, List<CatalogPrintingRef>> printingsByCodes(Collection<String> codes);

    /**
     * Cards of the game whose name is close to one of {@code names}, found as {@code GET
     * /cards/suggest} finds them (normalised name equal, then prefix and substring, full text,
     * trigram), at most {@code perName} per name, in that order.
     */
    List<CatalogCardRef> cardsByNames(UUID gameId, List<String> names, int perName);

    /** Printings of ACTIVE games of the given cards, by card, the most recent set first. */
    Map<UUID, List<CatalogPrintingRef>> printingsOfCards(Collection<UUID> cardIds);

    /** Name and picture of the given cards (ACTIVE games), by card. */
    Map<UUID, CardSummary> cards(Collection<UUID> cardIds);

    /**
     * The codes among {@code setCodes} (upper case) of the sets of the game {@code gameId} that
     * have a printing: the sets the catalog knows, which settle a code read in doubt between
     * English and another language ({@link ScanRules#setsToLookUp}).
     */
    Set<String> knownSetCodes(UUID gameId, Collection<String> setCodes);
}
