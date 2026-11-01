package com.orenjitrade.api.cards.infra;

import com.orenjitrade.api.common.seed.SeedContributor;
import java.nio.charset.StandardCharsets;
import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Fictional Yu-Gi-Oh! cards a YDK deck file can name, for the end-to-end suites only ({@code
 * orenji.seed.import-fixtures=true}, env {@code SEED_IMPORT_FIXTURES}; off everywhere by default).
 *
 * <p>A YDK passcode is matched through {@code card.external_ref} of the provider {@code
 * ygoprodeck}, and the mock catalog of the seed is another provider: without these rows no deck
 * file could match anything in an end-to-end database. They do not belong in the shared seed: a
 * developer's database can import the real catalog ({@code npm run catalog:import}), where an
 * invented passcode could meet a real card, or stay behind as a card YGOPRODeck never had. So the
 * contributor only exists where it is asked for, and it refuses to run where the real provider is
 * enabled: the end-to-end APIs run with {@code YGOPRODECK_ENABLED=false} and their own databases,
 * which never import the real catalog.
 *
 * <p>The fixture (passcodes of nine digits; real ones have eight):
 *
 * <ul>
 *   <li>{@code 910000001} "Fixture Lantern Wisp": one printing ({@code YDKF-EN001}), so a deck row
 *       is preselected;
 *   <li>{@code 910000002} "Fixture Clockwork Heron": two printings, {@code YDKF-EN002} (set of
 *       2026-01-10) and {@code YDKR-EN002} (set of 2026-06-20), so a deck row is "choose a
 *       printing" and the most recent one is {@code YDKR-EN002};
 *   <li>{@code 910000003}: an alternate artwork of the Clockwork Heron (an artwork id, not a card);
 *   <li>any other passcode, for example {@code 919999999}, is unknown.
 * </ul>
 *
 * Idempotent: stable ids, {@code ON CONFLICT DO NOTHING}.
 */
@Component
@ConditionalOnProperty(name = "orenji.seed.import-fixtures", havingValue = "true")
public class ImportFixtureSeedContributor implements SeedContributor {

    static final String PROVIDER = "ygoprodeck";
    static final String GAME = "yugioh";

    private static final Logger log = LoggerFactory.getLogger(ImportFixtureSeedContributor.class);

    private final JdbcClient jdbc;
    private final boolean realProviderEnabled;
    private final TransactionTemplate tx;

    public ImportFixtureSeedContributor(
            JdbcClient jdbc,
            @Value("${orenji.card-providers.ygoprodeck.enabled:true}") boolean realProviderEnabled,
            PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.realProviderEnabled = realProviderEnabled;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Override
    public String name() {
        return "import-fixtures";
    }

    @Override
    public int order() {
        return ORDER_CATALOG + 10;
    }

    @Override
    public void seed() {
        if (realProviderEnabled) {
            throw new IllegalStateException(
                    "orenji.seed.import-fixtures adds fictional cards under the provider"
                            + " ygoprodeck: it is only for databases that never import the real"
                            + " catalog. Set YGOPRODECK_ENABLED=false, or leave the fixtures off.");
        }
        Integer added = tx.execute(status -> addFixtures());
        log.info("Import fixtures seeded: {} row(s) added", added);
    }

    int addFixtures() {
        int added = 0;
        UUID first = set("YDKF", "YDK Fixtures", LocalDate.of(2026, 1, 10));
        UUID reprint = set("YDKR", "YDK Fixtures Reprint", LocalDate.of(2026, 6, 20));
        UUID wisp = id("card:910000001");
        UUID heron = id("card:910000002");
        added += card(wisp, "Fixture Lantern Wisp", "fixture-lantern-wisp", "910000001");
        added += card(heron, "Fixture Clockwork Heron", "fixture-clockwork-heron", "910000002");
        added += printing(id("printing:YDKF-EN001"), wisp, first, "EN001", "YDKF-EN001", "Rare");
        added += printing(id("printing:YDKF-EN002"), heron, first, "EN002", "YDKF-EN002", "Rare");
        added +=
                printing(
                        id("printing:YDKR-EN002"),
                        heron,
                        reprint,
                        "EN002",
                        "YDKR-EN002",
                        "Ultra Rare");
        added += artwork(id("artwork:910000003"), heron, "910000003");
        return added;
    }

    /** The fixture set {@code code}, created when missing; returns its id. */
    private UUID set(String code, String name, LocalDate releaseDate) {
        jdbc.sql(
                        """
                        INSERT INTO card_set (id, game_id, code, name, release_date)
                        SELECT :id, g.id, :code, :name, :releaseDate FROM game g
                         WHERE g.slug = :game
                        ON CONFLICT (game_id, code) DO NOTHING
                        """)
                .param("id", id("set:" + code))
                .param("code", code)
                .param("name", name)
                .param("releaseDate", Date.valueOf(releaseDate))
                .param("game", GAME)
                .update();
        return jdbc.sql(
                        "SELECT s.id FROM card_set s JOIN game g ON g.id = s.game_id WHERE g.slug ="
                                + " :game AND s.code = :code")
                .param("game", GAME)
                .param("code", code)
                .query(UUID.class)
                .single();
    }

    private int card(UUID id, String name, String slug, String passcode) {
        return jdbc.sql(
                        """
                        INSERT INTO card (id, game_id, name, slug, card_type, subtype, text,
                            external_ref)
                        SELECT :id, g.id, :name, :slug, 'Monster', 'Effect',
                               'A fictional card of the import fixtures.',
                               CAST(:externalRef AS jsonb)
                          FROM game g WHERE g.slug = :game
                        ON CONFLICT DO NOTHING
                        """)
                .param("id", id)
                .param("name", name)
                .param("slug", slug)
                .param(
                        "externalRef",
                        "{\"provider\":\"" + PROVIDER + "\",\"id\":\"" + passcode + "\"}")
                .param("game", GAME)
                .update();
    }

    private int printing(
            UUID id, UUID cardId, UUID setId, String number, String code, String rarity) {
        return jdbc.sql(
                        """
                        INSERT INTO card_printing (id, card_id, set_id, collector_number, rarity,
                            edition, language, finish, printing_code)
                        SELECT :id, :cardId, :setId, :number, :rarity, 'UNLIMITED', 'en', 'NORMAL',
                               :code
                         WHERE EXISTS (SELECT 1 FROM card WHERE id = :cardId)
                        ON CONFLICT DO NOTHING
                        """)
                .param("id", id)
                .param("cardId", cardId)
                .param("setId", setId)
                .param("number", number)
                .param("rarity", rarity)
                .param("code", code)
                .update();
    }

    /** An alternate artwork: an id of its own at the provider, a source nobody can reach. */
    private int artwork(UUID id, UUID cardId, String passcode) {
        return jdbc.sql(
                        """
                        INSERT INTO card_image (id, card_id, game_id, kind, provider,
                            provider_image_id, position, source_url, cache_status, source)
                        SELECT :id, c.id, c.game_id, 'FRONT', :provider, :passcode, 1,
                               'http://127.0.0.1:9/images/cards/' || :passcode || '.jpg',
                               'NOT_CACHED', :provider
                          FROM card c WHERE c.id = :cardId
                        ON CONFLICT DO NOTHING
                        """)
                .param("id", id)
                .param("cardId", cardId)
                .param("provider", PROVIDER)
                .param("passcode", passcode)
                .update();
    }

    private static UUID id(String name) {
        return UUID.nameUUIDFromBytes(
                ("s5-import-fixture:" + name).getBytes(StandardCharsets.UTF_8));
    }

    /** The passcodes a fixture deck file can use, for documentation and tests. */
    public static List<String> passcodes() {
        return List.of("910000001", "910000002", "910000003");
    }
}
