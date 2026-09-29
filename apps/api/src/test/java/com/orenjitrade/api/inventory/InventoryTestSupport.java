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

    /** Privacy settings body. */
    public static Map<String, Object> privacy(boolean discoverable, String profileVisibility) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("discoverable", discoverable);
        body.put("showDistance", true);
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
