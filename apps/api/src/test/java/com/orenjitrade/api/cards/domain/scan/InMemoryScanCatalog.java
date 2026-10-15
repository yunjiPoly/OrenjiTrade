package com.orenjitrade.api.cards.domain.scan;

import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.CatalogCardRef;
import com.orenjitrade.api.cards.domain.CatalogPrintingRef;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A small fictional catalog in memory for the scan rules: fictional twins of the mockup's samples
 * (Yew Flowers & Velvet Breeze, Fable Tide - Lyra, Inkshade Interference in several rarities), an
 * old ZOB-era card, a French printing, look-alike traps and a card of another game. Counts the
 * lookups, so the tests see that a match costs a few grouped queries, never one per variant.
 */
final class InMemoryScanCatalog implements ScanCatalogLookup {

    static final UUID YUGIOH = UUID.nameUUIDFromBytes("yugioh".getBytes());

    record Card(UUID id, String game, String name) {}

    final Map<UUID, Card> cards = new LinkedHashMap<>();
    final List<CatalogPrintingRef> printings = new ArrayList<>();
    final Map<String, Integer> calls = new LinkedHashMap<>();
    final List<Collection<String>> codeLookups = new ArrayList<>();

    final Card yew = card("Yew Flowers & Velvet Breeze");
    final Card lyra = card("Fable Tide - Lyra");
    final Card skye = card("Fable Tide - Skye");
    final Card interference = card("Inkshade Interference");
    final Card darkMoonseer = card("Dark Moonseer");
    final Card paleMoon = card("Pale-Moon Frost Dragon");
    final Card swordDancer = card("Sword Dancer of the Dunes");
    final Card shadowOracle = card("Shadow Oracle");
    final Card europeGolem = card("Old Europe Golem");
    final Card tenfold = card("Tenfold Iron Sentry");
    final Card gateKeeper = card("Twin Gate Keeper");
    final Card gateWarden = card("Twin Gate Warden");
    final Card tinHerald = card("Zither Tin Herald");
    final Card tinPage = card("Zither Tin Page");
    final Card otherGame = card("pokemon", "Yew Flowers Fox");

    static final String[] ZA01_RARITIES = {
        "Super Rare",
        "Ultra Rare",
        "Secret Rare",
        "Prismatic Collector's Rare",
        "Prismatic Ultimate Rare",
        "Platinum Secret Rare",
        "Quarter Century Secret Rare"
    };

    InMemoryScanCatalog() {
        LocalDate zacr = LocalDate.of(2017, 5, 4);
        LocalDate za01 = LocalDate.of(2023, 11, 3);
        LocalDate zob = LocalDate.of(2002, 3, 8);
        printing(yew, "ZACR", "Lantern Crisis", zacr, "ZACR-EN036", "Secret Rare", "en");
        printing(
                yew,
                "ZA01",
                "25th Lanternfall Rarity Collection",
                za01,
                "ZA01-EN008",
                "Super Rare",
                "en");
        printing(
                yew,
                "ZA01",
                "25th Lanternfall Rarity Collection",
                za01,
                "ZA01-EN008",
                "Quarter Century Secret Rare",
                "en");
        printing(yew, "ZACR", "Lantern Crisis", zacr, "ZACR-FR036", "Secret Rare", "fr");
        printing(lyra, "ZACR", "Lantern Crisis", zacr, "ZACR-EN038", "Super Rare", "en");
        printing(skye, "ZACR", "Lantern Crisis", zacr, "ZACR-EN035", "Common", "en");
        for (String rarity : ZA01_RARITIES) {
            printing(
                    interference,
                    "ZA01",
                    "25th Lanternfall Rarity Collection",
                    za01,
                    "ZA01-EN075",
                    rarity,
                    "en");
        }
        printing(
                interference,
                "ZLOD",
                "Lights of Silverfalls",
                LocalDate.of(2018, 11, 9),
                "ZLOD-EN077",
                "Secret Rare",
                "en");
        printing(
                darkMoonseer,
                "ZOB",
                "Legend of Pale Moon Frost Dragon",
                zob,
                "ZOB-EN005",
                "Ultra Rare",
                "en");
        printing(
                paleMoon,
                "ZOB",
                "Legend of Pale Moon Frost Dragon",
                zob,
                "ZOB-001",
                "Ultra Rare",
                "en");
        printing(swordDancer, "ZDS", "Fictional Dunes", zob, "ZDS-EN001", "Common", "en");
        printing(shadowOracle, "Z05", "Fictional Oracles", zob, "Z05-EN001", "Common", "en");
        // An old English Europe print: read without its dash, ZMDE001 could be a German ZM-DE001.
        printing(europeGolem, "ZMD", "Fictional Raiders", zob, "ZMD-E001", "Common", "en");
        // Read without its dash, ZV10EN0O1 could be a German ZV1-0EN0O1: no set ZV1 here.
        printing(tenfold, "ZV10", "Fictional Sentries", za01, "ZV10-EN001", "Common", "en");
        // Two sets whose codes make a dashless ZBOEN0O1 English (ZBO) or a German misread (ZB).
        printing(gateKeeper, "ZB", "Fictional Gates", za01, "ZB-EN001", "Common", "en");
        printing(gateWarden, "ZBO", "Fictional Gates Two", za01, "ZBO-EN001", "Common", "en");
        // Read without its dash, ZT10E001 could be ZT10-E001 (the old form of ZT10-EN001) or a
        // German ZT1-DE001 with its D read as 0: the catalog knows both sets.
        printing(tinHerald, "ZT10", "Fictional Tins Ten", za01, "ZT10-EN001", "Common", "en");
        printing(tinPage, "ZT1", "Fictional Tins", zob, "ZT1-EN001", "Common", "en");
        printing(otherGame, "ZACR", "Fictional Pokemon Set", zacr, "ZACR-EN036", "Rare", "en");
        printing(otherGame, "ZV1", "Fictional Pokemon Sentries", za01, "ZV1-EN001", "Rare", "en");
    }

    Card card(String name) {
        return card("yugioh", name);
    }

    Card card(String game, String name) {
        Card card = new Card(UUID.nameUUIDFromBytes((game + name).getBytes()), game, name);
        cards.put(card.id(), card);
        return card;
    }

    CatalogPrintingRef printing(
            Card card,
            String setCode,
            String setName,
            @Nullable LocalDate released,
            String code,
            String rarity,
            String language) {
        CatalogPrintingRef ref =
                new CatalogPrintingRef(
                        UUID.nameUUIDFromBytes((card.id() + code + rarity).getBytes()),
                        card.id(),
                        card.game(),
                        setCode,
                        setName,
                        released,
                        code.substring(code.indexOf('-') + 1),
                        code,
                        rarity,
                        "UNLIMITED",
                        language,
                        "NORMAL");
        printings.add(ref);
        return ref;
    }

    /** The printings of a card with a code, in catalog order. */
    List<CatalogPrintingRef> of(Card card, String code) {
        return printings.stream()
                .filter(ref -> ref.cardId().equals(card.id()) && code.equals(ref.printingCode()))
                .toList();
    }

    int totalCalls() {
        return calls.values().stream().mapToInt(Integer::intValue).sum();
    }

    private void count(String lookup) {
        calls.merge(lookup, 1, Integer::sum);
    }

    @Override
    public Map<String, List<CatalogPrintingRef>> printingsByCodes(Collection<String> codes) {
        count("printingsByCodes");
        codeLookups.add(List.copyOf(codes));
        Map<String, List<CatalogPrintingRef>> result = new LinkedHashMap<>();
        for (CatalogPrintingRef ref : printings) {
            if (codes.contains(ref.printingCode())) {
                result.computeIfAbsent(ref.printingCode(), code -> new ArrayList<>()).add(ref);
            }
        }
        return result;
    }

    @Override
    public List<CatalogCardRef> cardsByNames(UUID gameId, List<String> names, int perName) {
        count("cardsByNames");
        List<CatalogCardRef> result = new ArrayList<>();
        for (String name : names) {
            String read = NameSimilarity.key(name);
            cards.values().stream()
                    .filter(card -> card.game().equals("yugioh"))
                    .filter(
                            card ->
                                    NameSimilarity.key(card.name()).contains(read)
                                            || NameSimilarity.score(name, card.name()) >= 0.3)
                    .sorted(
                            Comparator.comparingInt((Card card) -> rank(read, card))
                                    .thenComparing(
                                            Comparator.comparingDouble(
                                                            (Card card) ->
                                                                    NameSimilarity.score(
                                                                            name, card.name()))
                                                    .reversed()))
                    .limit(perName)
                    .forEach(
                            card ->
                                    result.add(
                                            new CatalogCardRef(
                                                    card.id(), card.game(), card.name())));
        }
        return result;
    }

    private static int rank(String read, Card card) {
        String name = NameSimilarity.key(card.name());
        return name.equals(read) ? 0 : name.startsWith(read) ? 1 : name.contains(read) ? 2 : 3;
    }

    @Override
    public Map<UUID, List<CatalogPrintingRef>> printingsOfCards(Collection<UUID> cardIds) {
        count("printingsOfCards");
        Map<UUID, List<CatalogPrintingRef>> result = new LinkedHashMap<>();
        printings.stream()
                .filter(ref -> cardIds.contains(ref.cardId()))
                .sorted(
                        Comparator.comparing(
                                        CatalogPrintingRef::setReleaseDate,
                                        Comparator.nullsLast(Comparator.<LocalDate>reverseOrder()))
                                .thenComparing(CatalogPrintingRef::printingCode))
                .forEach(
                        ref ->
                                result.computeIfAbsent(ref.cardId(), id -> new ArrayList<>())
                                        .add(ref));
        return result;
    }

    @Override
    public Map<UUID, CardSummary> cards(Collection<UUID> cardIds) {
        count("cards");
        Map<UUID, CardSummary> result = new LinkedHashMap<>();
        Set<UUID> wanted = new LinkedHashSet<>(cardIds);
        for (UUID id : wanted) {
            Card card = cards.get(id);
            if (card != null) {
                result.put(
                        id,
                        new CardSummary(
                                id,
                                card.game(),
                                card.name(),
                                "slug",
                                null,
                                null,
                                "/api/v1/public/card-images/" + id,
                                1,
                                Map.of()));
            }
        }
        return result;
    }

    @Override
    public Set<String> knownSetCodes(UUID gameId, Collection<String> setCodes) {
        count("knownSetCodes");
        Set<String> known = new LinkedHashSet<>();
        for (CatalogPrintingRef ref : printings) {
            if (ref.game().equals("yugioh") && setCodes.contains(ref.setCode())) {
                known.add(ref.setCode());
            }
        }
        return known;
    }
}
