package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.gameId;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.limits.domain.UsageLimitService;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * {@code binder.views.per_day} on {@code GET /public/binders/{id}} (Phase 4 contract, usage
 * limits): signed-in visitors consume one unit per binder and UTC day; repeated views of the same
 * binder, the owner's own views and signed-out views never count; beyond the limit the answer is
 * {@code 429 LIMIT_REACHED} with the limit's extensions (no plan since stage F1) and nothing is
 * consumed; an unlimited setting lifts it for every visitor.
 */
class BinderViewLimitIT extends AbstractIntegrationTest {

    @Autowired private CatalogImportService importService;
    @Autowired private UsageLimitService usageLimits;

    private final List<String> binderIds = new ArrayList<>();
    private String owner;

    @BeforeEach
    void binders() {
        InventoryTestSupport.ensureCatalog(importService);
        testUsers.update(
                "UPDATE usage_limit SET max_value = 2 WHERE limit_key = 'binder.views.per_day'");
        usageLimits.invalidate();
        owner = uniqueUid("views-owner");
        provisionCompliant(owner);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                owner,
                privacy(true, "MEMBERS"),
                200);
        UUID printingId = printing(testUsers, "rb-p004a");
        for (String name : List.of("First", "Second", "Third")) {
            String id =
                    callJson(
                                    HttpMethod.POST,
                                    "/api/v1/binders",
                                    owner,
                                    binder(name, "PUBLIC", gameId(testUsers, "riftbound")),
                                    201)
                            .path("id")
                            .asString();
            Map<String, Object> body = item(printingId);
            body.put("binderId", id);
            callJson(HttpMethod.POST, "/api/v1/inventory/items", owner, body, 201);
            binderIds.add(id);
        }
    }

    @AfterEach
    void restoreViewLimit() {
        testUsers.update(
                "UPDATE usage_limit SET max_value = 30 WHERE limit_key = 'binder.views.per_day'");
        usageLimits.invalidate();
    }

    private String view(int index) {
        return "/api/v1/public/binders/" + binderIds.get(index);
    }

    private long used(String uid) {
        for (JsonNode limit :
                callJson(HttpMethod.GET, "/api/v1/me/limits", uid, null, 200).path("limits")) {
            if ("binder.views.per_day".equals(limit.path("key").asString())) {
                return limit.path("used").asLong();
            }
        }
        throw new AssertionError("binder.views.per_day missing from /me/limits");
    }

    @Test
    void visitorsConsumeOneViewPerBinderAndDay() {
        String visitor = uniqueUid("views-visitor");
        provisionCompliant(visitor);
        callJson(HttpMethod.GET, view(0), visitor, null, 200);
        callJson(HttpMethod.GET, view(0), visitor, null, 200);
        assertThat(used(visitor)).as("the same binder counts once a day").isEqualTo(1);
        callJson(HttpMethod.GET, view(1), visitor, null, 200);
        assertThat(used(visitor)).isEqualTo(2);

        JsonNode problem = callJson(HttpMethod.GET, view(2), visitor, null, 429);
        assertThat(problem.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(problem.path("limitKey").asString()).isEqualTo("binder.views.per_day");
        assertThat(problem.path("limit").asInt()).isEqualTo(2);
        assertThat(problem.path("used").asLong()).isEqualTo(2);
        assertThat(problem.has("planCode")).isFalse();
        assertThat(problem.has("upgradeUrl")).isFalse();
        assertThat(problem.path("resetsAt").asString()).isNotBlank();
        assertThat(used(visitor)).as("a refused view consumes nothing").isEqualTo(2);
        // Binders already seen today stay readable.
        callJson(HttpMethod.GET, view(0), visitor, null, 200);
        callJson(HttpMethod.GET, view(1), visitor, null, 200);
        // The binder's items are not limited (only the binder view counts).
        callJson(HttpMethod.GET, view(2) + "/items", visitor, null, 200);
    }

    @Test
    void ownerAndSignedOutViewsNeverCount() {
        for (int round = 0; round < 3; round++) {
            for (int index = 0; index < binderIds.size(); index++) {
                callJson(HttpMethod.GET, view(index), owner, null, 200);
                callJson(HttpMethod.GET, view(index), null, null, 200);
            }
        }
        assertThat(used(owner)).isZero();
    }

    @Test
    void anUnlimitedSettingLiftsTheLimitForEveryVisitor() {
        testUsers.update(
                "UPDATE usage_limit SET max_value = NULL WHERE limit_key = 'binder.views.per_day'");
        usageLimits.invalidate();
        for (String prefix : List.of("views-unlimited-a", "views-unlimited-b")) {
            String visitor = uniqueUid(prefix);
            provisionCompliant(visitor);
            for (int index = 0; index < binderIds.size(); index++) {
                callJson(HttpMethod.GET, view(index), visitor, null, 200);
            }
            assertThat(used(visitor)).isEqualTo(binderIds.size());
        }
    }
}
