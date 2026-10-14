package com.orenjitrade.api.inventory;

import com.orenjitrade.api.TestUsers;
import java.time.LocalDate;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.jspecify.annotations.Nullable;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Fictional catalog rows for the inventory import tests. A YDK passcode is matched through {@code
 * card.external_ref} of the provider {@code ygoprodeck}, and the mock catalog has no such card: the
 * tests create their own, in the throwaway database of the suite, with random nine-digit passcodes
 * that start with 8 (real passcodes have eight digits; the YGOPRODeck fixture of the catalog tests
 * uses 9000000xx). Nothing here is ever seeded into a developer's database, so no fictional
 * passcode can meet a real catalog import.
 */
public final class ImportTestSupport {

    public static final String IMPORTS = "/api/v1/inventory/imports";
    public static final String PROVIDER = "ygoprodeck";

    private ImportTestSupport() {}

    /** A set of one test. */
    public record TestSet(UUID id, String code, String name) {}

    /** A card of one test; {@code passcode} is {@code null} for a card no provider knows. */
    public record TestCard(UUID id, String name, @Nullable String passcode) {}

    /** A printing of one test. */
    public record TestPrinting(UUID id, String code, String number) {}

    /**
     * Uploads an import file as the generated clients do (multipart part {@code file}, query
     * parameter {@code source}) and returns the raw answer, whatever its status. {@code
     * InventoryImportIT} sends {@code source} as a form field instead: the server reads both.
     */
    public static EntityExchangeResult<byte[]> upload(
            RestTestClient http, String authorization, String source, byte[] content) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part(
                "file",
                new ByteArrayResource(content) {
                    @Override
                    public String getFilename() {
                        return "upload.bin";
                    }
                });
        return http.post()
                .uri(IMPORTS + "?source=" + source)
                .header(HttpHeaders.AUTHORIZATION, authorization)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(builder.build())
                .exchange()
                .expectBody()
                .returnResult();
    }

    /** A passcode no other test and no real card has. */
    public static String passcode() {
        return "8"
                + String.format(
                        Locale.ROOT, "%08d", ThreadLocalRandom.current().nextInt(100_000_000));
    }

    /** A new set of {@code game}, released on {@code releaseDate}. */
    public static TestSet set(TestUsers testUsers, String game, @Nullable LocalDate releaseDate) {
        UUID id = UUID.randomUUID();
        String word = InventoryTestSupport.token();
        String code = "I" + word.substring(2).toUpperCase(Locale.ROOT).substring(0, 7);
        String name = word + " Set";
        testUsers.update(
                "INSERT INTO card_set (id, game_id, code, name, release_date)"
                        + " SELECT ?, g.id, ?, ?, ? FROM game g WHERE g.slug = ?",
                id,
                code,
                name,
                releaseDate == null ? null : java.sql.Date.valueOf(releaseDate),
                game);
        return new TestSet(id, code, name);
    }

    /**
     * A new card of {@code game} under a unique name, known to the provider by {@code passcode}.
     */
    public static TestCard card(TestUsers testUsers, String game, @Nullable String passcode) {
        return card(testUsers, game, passcode, InventoryTestSupport.token() + " Fixture");
    }

    /** A new card of {@code game} named {@code name}. */
    public static TestCard card(
            TestUsers testUsers, String game, @Nullable String passcode, String name) {
        UUID id = UUID.randomUUID();
        String slug =
                InventoryTestSupport.token().toLowerCase(Locale.ROOT)
                        + "-"
                        + Long.toHexString(ThreadLocalRandom.current().nextLong() & 0xffffffL);
        testUsers.update(
                "INSERT INTO card (id, game_id, name, slug, card_type, text, external_ref)"
                        + " SELECT ?, g.id, ?, ?, 'Monster', '', CAST(? AS jsonb) FROM game g"
                        + " WHERE g.slug = ?",
                id,
                name,
                slug,
                passcode == null
                        ? null
                        : "{\"provider\":\"" + PROVIDER + "\",\"id\":\"" + passcode + "\"}",
                game);
        return new TestCard(id, name, passcode);
    }

    /** A printing of {@code card} in {@code set}: English, unlimited, normal finish. */
    public static TestPrinting printing(
            TestUsers testUsers, TestCard card, TestSet set, String number, String rarity) {
        return printing(testUsers, card, set, number, rarity, "UNLIMITED", "en");
    }

    /** A printing of {@code card} in {@code set}. */
    public static TestPrinting printing(
            TestUsers testUsers,
            TestCard card,
            TestSet set,
            String number,
            String rarity,
            String edition,
            String language) {
        UUID id = UUID.randomUUID();
        String code = set.code() + "-" + number;
        testUsers.update(
                "INSERT INTO card_printing (id, card_id, set_id, collector_number, rarity,"
                        + " edition, language, finish, printing_code) VALUES (?, ?, ?, ?, ?, ?, ?,"
                        + " 'NORMAL', ?)",
                id,
                card.id(),
                set.id(),
                number,
                rarity,
                edition,
                language,
                code);
        return new TestPrinting(id, code, number);
    }

    /**
     * An alternate artwork of {@code card} with a passcode of its own, as the provider lists one:
     * an artwork of the card, not a card. The source URL is a closed local port.
     */
    public static void artwork(TestUsers testUsers, TestCard card, String passcode) {
        testUsers.update(
                "INSERT INTO card_image (id, card_id, game_id, kind, provider, provider_image_id,"
                        + " position, source_url, cache_status, source)"
                        + " SELECT ?, c.id, c.game_id, 'FRONT', ?, ?, 1, ?, 'NOT_CACHED', ?"
                        + " FROM card c WHERE c.id = ?",
                UUID.randomUUID(),
                PROVIDER,
                passcode,
                "http://127.0.0.1:9/images/cards/" + passcode + ".jpg",
                PROVIDER,
                card.id());
    }
}
