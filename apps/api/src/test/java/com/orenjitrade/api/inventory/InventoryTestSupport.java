package com.orenjitrade.api.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.TestUsers;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.cards.domain.SyncRunStatus;
import com.orenjitrade.api.cards.domain.provider.SyncMode;
import com.orenjitrade.api.cards.infra.MockCardProvider;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

/** Shared helpers of the inventory and binder integration tests. */
public final class InventoryTestSupport {

    /** Service token accepted on /internal/** under the test profile. */
    public static final String SERVICE_TOKEN = "local-service-token";

    private static volatile boolean imported;

    private InventoryTestSupport() {}

    /** Imports the mock catalog of every game once per JVM (the import is idempotent anyway). */
    public static synchronized void ensureCatalog(CatalogImportService importService) {
        if (imported) {
            return;
        }
        for (String game : MockCardProvider.GAMES) {
            assertThat(
                            importService
                                    .importNow(MockCardProvider.PROVIDER_ID, game, SyncMode.FULL)
                                    .status())
                    .as("import of %s", game)
                    .isEqualTo(SyncRunStatus.SUCCEEDED);
        }
        imported = true;
    }

    /** Id of a mock printing by its provider id (e.g. {@code ygo-p001a}). */
    public static UUID printing(TestUsers testUsers, String ref) {
        return (UUID)
                testUsers
                        .query(
                                "SELECT id FROM card_printing WHERE external_ref ->> 'provider' ="
                                        + " 'mock' AND external_ref ->> 'id' = ?",
                                ref)
                        .get(0)
                        .get("id");
    }

    /**
     * A catalog card of one test only (regions are shared by the whole suite, ADR 0017).
     *
     * @param cardId the card
     * @param printingId its first printing
     * @param name its unique name
     * @param code the printing code of its first printing
     */
    public record IsolatedCard(UUID cardId, UUID printingId, String name, String code) {}

    /** A random alphabetic token no other test uses. */
    public static String token() {
        java.util.concurrent.ThreadLocalRandom random =
                java.util.concurrent.ThreadLocalRandom.current();
        StringBuilder token = new StringBuilder("Zq");
        for (int i = 0; i < 8; i++) {
            token.append((char) ('a' + random.nextInt(26)));
        }
        return token.toString();
    }

    /**
     * A new card cloned from the card of mock printing {@code ref} (same game, set, rarity and
     * language) under a unique name, with one printing of a unique code: other tests never list it.
     */
    public static IsolatedCard isolatedCard(TestUsers testUsers, String ref) {
        UUID source = printing(testUsers, ref);
        UUID cardId = UUID.randomUUID();
        String word = token();
        String name = word + " Proxy";
        testUsers.update(
                "INSERT INTO card (id, game_id, name, slug, card_type, subtype, text, metadata)"
                        + " SELECT ?, c.game_id, ?, ?, c.card_type, c.subtype, c.text, c.metadata"
                        + " FROM card c JOIN card_printing p ON p.card_id = c.id WHERE p.id = ?",
                cardId,
                name,
                word.toLowerCase(java.util.Locale.ROOT) + "-proxy",
                source);
        String code = "T" + word.substring(2, 8).toUpperCase(java.util.Locale.ROOT) + "-EN001";
        return new IsolatedCard(
                cardId, clonePrinting(testUsers, source, cardId, code, null), name, code);
    }

    /** Another printing of an isolated card, cloned from mock printing {@code ref}. */
    public static UUID siblingPrinting(
            TestUsers testUsers, IsolatedCard card, String ref, @Nullable String language) {
        String code = card.code().replace("-EN001", language == null ? "-EN002" : "-FR001");
        return clonePrinting(testUsers, printing(testUsers, ref), card.cardId(), code, language);
    }

    private static UUID clonePrinting(
            TestUsers testUsers, UUID source, UUID cardId, String code, @Nullable String language) {
        UUID printingId = UUID.randomUUID();
        testUsers.update(
                "INSERT INTO card_printing (id, card_id, set_id, collector_number, rarity, edition,"
                        + " language, finish, printing_code, metadata) SELECT ?, ?, set_id, ?,"
                        + " rarity, edition, COALESCE(?, language), finish, ?, metadata FROM"
                        + " card_printing WHERE id = ?",
                printingId,
                cardId,
                code.substring(code.indexOf('-') + 1) + code.substring(1, 4),
                language,
                code,
                source);
        return printingId;
    }

    /** Privacy settings body. */
    public static Map<String, Object> privacy(boolean discoverable, String profileVisibility) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("discoverable", discoverable);
        body.put("showOnlineStatus", false);
        body.put("showLastActive", true);
        body.put("profileVisibility", profileVisibility);
        body.put("messagingPermission", "MEMBERS_WITH_PROFILE");
        body.put("wishlistVisible", false);
        body.put("searchDiscoverable", true);
        return body;
    }

    /** A minimal item body. */
    public static Map<String, Object> item(UUID printingId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("printingId", printingId.toString());
        return body;
    }

    /** A binder body. */
    public static Map<String, Object> binder(String name, String visibility) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("visibility", visibility);
        return body;
    }

    /** Ids of the items of a page or array. */
    public static List<String> ids(JsonNode pageOrArray) {
        JsonNode items = pageOrArray.has("items") ? pageOrArray.path("items") : pageOrArray;
        List<String> ids = new java.util.ArrayList<>();
        items.forEach(node -> ids.add(node.path("id").asString()));
        return ids;
    }

    /** A PNG image of the given size. */
    public static byte[] png(int width, int height) {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
