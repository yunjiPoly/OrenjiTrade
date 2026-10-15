package com.orenjitrade.api.cards;

import com.orenjitrade.api.TestUsers;
import com.orenjitrade.api.cards.domain.CatalogText;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;

/**
 * The small fictional Yu-Gi-Oh! catalog of the camera scan's integration tests, written as SQL rows
 * (never fetched from YGOPRODeck): Yew Flowers & Velvet Breeze (ZACR-EN036, two ZA01-EN008 rarities
 * and a French ZACR-FR036), Fable Tide - Lyra (ZACR-EN038), Inkshade Interference (ZA01-EN075 in
 * seven rarities and ZLOD-EN077), the old Dark Moonseer (ZOB-EN005), and Tenfold Iron Sentry
 * (ZIRO-EN001: read without its dash, ZIROEN0O1 could be a German ZIR-DEN0O1 misread; the only set
 * ZIR is a Pokemon one). Stable ids and {@code ON CONFLICT DO NOTHING}: the suite shares one
 * database, so it is written once.
 */
final class ScanTestCatalog {

    static final String YEW = "Yew Flowers & Velvet Breeze";
    static final String LYRA = "Fable Tide - Lyra";
    static final String INTERFERENCE = "Inkshade Interference";
    static final String DARK_MOONSEER = "Dark Moonseer";
    static final String SENTRY = "Tenfold Iron Sentry";

    /** A card of another game whose set code ZIR is no Yu-Gi-Oh! set. */
    static final String OTHER_GAME_CARD = "Zircon Test Fox";

    static final String[] ZA01_RARITIES = {
        "Super Rare",
        "Ultra Rare",
        "Secret Rare",
        "Prismatic Collector's Rare",
        "Prismatic Ultimate Rare",
        "Platinum Secret Rare",
        "Quarter Century Secret Rare"
    };

    private static volatile boolean written;

    private ScanTestCatalog() {}

    /** A stable id of the fixture. */
    static UUID id(String key) {
        return UUID.nameUUIDFromBytes(("scan-it:" + key).getBytes(StandardCharsets.UTF_8));
    }

    /** The id of a card of the fixture. */
    static UUID card(String name) {
        return id("card:" + name);
    }

    /** The id of a printing of the fixture. */
    static UUID printing(String code, String rarity) {
        return id("printing:" + code + ":" + rarity);
    }

    /** Writes the catalog once. */
    static synchronized void ensure(TestUsers testUsers) {
        if (written) {
            return;
        }
        set(testUsers, "ZACR", "Lantern Crisis", LocalDate.of(2017, 5, 4));
        set(testUsers, "ZA01", "25th Lanternfall Rarity Collection", LocalDate.of(2023, 11, 3));
        set(testUsers, "ZLOD", "Lights of Silverfalls", LocalDate.of(2018, 11, 9));
        set(testUsers, "ZOB", "Legend of Pale Moon Frost Dragon", LocalDate.of(2002, 3, 8));
        set(testUsers, "ZIRO", "Fictional Sentries", LocalDate.of(2020, 2, 7));
        for (String name : new String[] {YEW, LYRA, INTERFERENCE, DARK_MOONSEER, SENTRY}) {
            testUsers.update(
                    "INSERT INTO card (id, game_id, name, slug, card_type)"
                            + " SELECT ?, g.id, ?, ?, 'Monster' FROM game g WHERE g.slug = 'yugioh'"
                            + " ON CONFLICT DO NOTHING",
                    card(name),
                    name,
                    CatalogText.slug(name));
        }
        printing(testUsers, YEW, "ZACR", "ZACR-EN036", "Secret Rare", "en");
        printing(testUsers, YEW, "ZA01", "ZA01-EN008", "Super Rare", "en");
        printing(testUsers, YEW, "ZA01", "ZA01-EN008", "Quarter Century Secret Rare", "en");
        printing(testUsers, YEW, "ZACR", "ZACR-FR036", "Secret Rare", "fr");
        printing(testUsers, LYRA, "ZACR", "ZACR-EN038", "Super Rare", "en");
        for (String rarity : ZA01_RARITIES) {
            printing(testUsers, INTERFERENCE, "ZA01", "ZA01-EN075", rarity, "en");
        }
        printing(testUsers, INTERFERENCE, "ZLOD", "ZLOD-EN077", "Secret Rare", "en");
        printing(testUsers, DARK_MOONSEER, "ZOB", "ZOB-EN005", "Ultra Rare", "en");
        printing(testUsers, SENTRY, "ZIRO", "ZIRO-EN001", "Common", "en");
        otherGame(testUsers);
        written = true;
    }

    /** The Pokemon set ZIR, with one card and one printing. */
    private static void otherGame(TestUsers testUsers) {
        testUsers.update(
                "INSERT INTO card_set (id, game_id, code, name, release_date)"
                        + " SELECT ?, g.id, 'ZIR', 'Fictional Zircons', ? FROM game g"
                        + " WHERE g.slug = 'pokemon' ON CONFLICT DO NOTHING",
                id("set:pokemon:ZIR"),
                LocalDate.of(2020, 2, 7));
        testUsers.update(
                "INSERT INTO card (id, game_id, name, slug, card_type)"
                        + " SELECT ?, g.id, ?, ?, 'Pokemon' FROM game g WHERE g.slug = 'pokemon'"
                        + " ON CONFLICT DO NOTHING",
                card(OTHER_GAME_CARD),
                OTHER_GAME_CARD,
                CatalogText.slug(OTHER_GAME_CARD));
        testUsers.update(
                "INSERT INTO card_printing (id, card_id, set_id, collector_number, rarity, edition,"
                        + " language, finish, printing_code) VALUES (?, ?, ?, 'EN001', 'Common',"
                        + " 'UNLIMITED', 'en', 'NORMAL', 'ZIR-EN001') ON CONFLICT DO NOTHING",
                printing("ZIR-EN001", "Common"),
                card(OTHER_GAME_CARD),
                id("set:pokemon:ZIR"));
    }

    private static void set(TestUsers testUsers, String code, String name, LocalDate released) {
        testUsers.update(
                "INSERT INTO card_set (id, game_id, code, name, release_date)"
                        + " SELECT ?, g.id, ?, ?, ? FROM game g WHERE g.slug = 'yugioh'"
                        + " ON CONFLICT DO NOTHING",
                id("set:" + code),
                code,
                name,
                released);
    }

    private static void printing(
            TestUsers testUsers,
            String cardName,
            String setCode,
            String code,
            String rarity,
            String language) {
        testUsers.update(
                "INSERT INTO card_printing (id, card_id, set_id, collector_number, rarity, edition,"
                        + " language, finish, printing_code) SELECT ?, ?, s.id, ?, ?, 'UNLIMITED',"
                        + " ?, 'NORMAL', ? FROM card_set s JOIN game g ON g.id = s.game_id"
                        + " WHERE g.slug = 'yugioh' AND s.code = ? ON CONFLICT DO NOTHING",
                printing(code, rarity),
                card(cardName),
                code.substring(code.indexOf('-') + 1),
                rarity,
                language,
                code,
                setCode);
    }
}
