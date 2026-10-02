package com.orenjitrade.api.cards;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * V102: application versions built before V100 (an older revision during a rolling deploy, or the
 * main checkout sharing a developer database) insert printing images without {@code card_id} and
 * {@code game_id}; the database derives them from the printing instead of refusing the row (which
 * aborted the mock catalog seed and with it the API start-up).
 */
class CardImageLegacyWriterIT extends AbstractIntegrationTest {

    /** The card image upsert of {@code CatalogWriteRepository} before V100, verbatim. */
    private static final String PRE_V100_UPSERT =
            """
            INSERT INTO card_image (id, printing_id, kind, url, width, height,
                source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, now(), now())
            ON CONFLICT (printing_id, kind) DO UPDATE
               SET url = EXCLUDED.url, width = EXCLUDED.width,
                   height = EXCLUDED.height, source = EXCLUDED.source,
                   updated_at = EXCLUDED.updated_at
             WHERE (card_image.url, card_image.width, card_image.height,
                    card_image.source)
                   IS DISTINCT FROM
                   (EXCLUDED.url, EXCLUDED.width, EXCLUDED.height, EXCLUDED.source)
            """;

    @Autowired private CatalogImportService importService;

    @BeforeEach
    void catalog() {
        CatalogTestSupport.ensureImported(importService);
    }

    @Test
    void preV100CatalogWritesStillSucceed() {
        Map<String, Object> printing =
                testUsers
                        .query(
                                "SELECT p.id, p.card_id, c.game_id FROM card_printing p JOIN card c"
                                        + " ON c.id = p.card_id JOIN game g ON g.id = c.game_id"
                                        + " WHERE g.slug = 'yugioh' AND p.printing_code ="
                                        + " 'AZR-EN001' ORDER BY p.id LIMIT 1")
                        .get(0);
        UUID printingId = (UUID) printing.get("id");
        String url = "/api/v1/public/placeholder-images/yugioh/azure-eyes-sky-dragon.svg";
        try {
            assertThat(
                            testUsers.update(
                                    PRE_V100_UPSERT,
                                    UUID.randomUUID(),
                                    printingId,
                                    "BACK",
                                    url,
                                    600,
                                    840,
                                    "placeholder"))
                    .isEqualTo(1);
            Map<String, Object> row =
                    testUsers
                            .query(
                                    "SELECT card_id, game_id, cache_status FROM card_image WHERE"
                                            + " printing_id = ? AND kind = 'BACK'",
                                    printingId)
                            .get(0);
            assertThat(row.get("card_id")).isEqualTo(printing.get("card_id"));
            assertThat(row.get("game_id")).isEqualTo(printing.get("game_id"));
            assertThat(row.get("cache_status")).isNull();

            // The conflict path of the same statement (unchanged row, then a changed one).
            assertThat(
                            testUsers.update(
                                    PRE_V100_UPSERT,
                                    UUID.randomUUID(),
                                    printingId,
                                    "BACK",
                                    url,
                                    600,
                                    840,
                                    "placeholder"))
                    .isZero();
            assertThat(
                            testUsers.update(
                                    PRE_V100_UPSERT,
                                    UUID.randomUUID(),
                                    printingId,
                                    "BACK",
                                    url,
                                    630,
                                    880,
                                    "placeholder"))
                    .isEqualTo(1);
            assertThat(
                            testUsers.count(
                                    "SELECT count(*) FROM card_image WHERE printing_id = ? AND kind"
                                            + " = 'BACK'",
                                    printingId))
                    .isEqualTo(1);
        } finally {
            testUsers.update(
                    "DELETE FROM card_image WHERE printing_id = ? AND kind = 'BACK'", printingId);
        }
    }
}
