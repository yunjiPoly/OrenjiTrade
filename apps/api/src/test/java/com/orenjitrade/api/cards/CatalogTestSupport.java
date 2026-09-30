package com.orenjitrade.api.cards;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.cards.domain.SyncRunStatus;
import com.orenjitrade.api.cards.domain.provider.SyncMode;
import com.orenjitrade.api.cards.infra.MockCardProvider;
import java.util.ArrayList;
import java.util.List;
import tools.jackson.databind.JsonNode;

/** Shared helpers of the catalog integration tests. */
final class CatalogTestSupport {

    private static volatile boolean imported;

    private CatalogTestSupport() {}

    /** Imports the mock catalog of every game once per JVM (the import is idempotent anyway). */
    static synchronized void ensureImported(CatalogImportService importService) {
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

    /** {@code name} of every item of a page or array. */
    static List<String> names(JsonNode pageOrArray) {
        JsonNode items = pageOrArray.has("items") ? pageOrArray.path("items") : pageOrArray;
        List<String> names = new ArrayList<>();
        items.forEach(item -> names.add(item.path("name").asString()));
        return names;
    }
}
