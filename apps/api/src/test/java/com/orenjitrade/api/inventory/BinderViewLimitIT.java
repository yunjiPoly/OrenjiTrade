package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.billing.domain.PlanService;
import com.orenjitrade.api.cards.domain.CatalogImportService;
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
 * {@code binder.views.per_day} on {@code GET /public/binders/{id}} (Phase 4 contract, Phase 10
 * limits): signed-in FREE visitors consume one unit per binder and UTC day; repeated views of the
 * same binder, the owner's own views and signed-out views never count; PREMIUM visitors and
 * entitlements are not limited; beyond the limit the answer is {@code 429 LIMIT_REACHED} with the
 * plan extensions and nothing is consumed.
 */
class BinderViewLimitIT extends AbstractIntegrationTest {

    @Autowired private CatalogImportService importService;
    @Autowired private PlanService planService;

    private final List<String> binderIds = new ArrayList<>();
    private String owner;

    @BeforeEach
    void binders() {
        InventoryTestSupport.ensureCatalog(importService);
        testUsers.update(
                "UPDATE usage_limit l SET max_value = 2 FROM plan p WHERE p.id = l.plan_id AND"
                        + " p.code = 'FREE' AND l.limit_key = 'binder.views.per_day'");
        planService.invalidate();
        owner = uniqueUid("views-owner");
        provisionCompliant(owner);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                owner,
                privacy(true, "MEMBERS"),
                200);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                owner,
                Map.of("lat", 45.53, "lng", -73.6, "radiusKm", 5),
                200);
        UUID printingId = printing(testUsers, "rb-p004a");
        for (String name : List.of("First", "Second", "Third")) {
            String id =
                    callJson(HttpMethod.POST, "/api/v1/binders", owner, binder(name, "PUBLIC"), 201)
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
                "UPDATE usage_limit l SET max_value = 30 FROM plan p WHERE p.id = l.plan_id AND"
                        + " p.code = 'FREE' AND l.limit_key = 'binder.views.per_day'");
        planService.invalidate();
    }

    private String view(int index) {
        return "/api/v1/public/binders/" + binderIds.get(index);
    }

    private long used(String uid) {
        for (JsonNode limit :
                callJson(HttpMethod.GET, "/api/v1/me/plan", uid, null, 200).path("limits")) {
            if ("binder.views.per_day".equals(limit.path("key").asString())) {
                return limit.path("used").asLong();
            }
        }
        throw new AssertionError("binder.views.per_day missing from /me/plan");
    }

    @Test
    void freeVisitorsConsumeOneViewPerBinderAndDay() {
        String visitor = uniqueUid("views-free");
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
        assertThat(problem.path("planCode").asString()).isEqualTo("FREE");
        assertThat(problem.path("upgradeUrl").asString()).isEqualTo("/premium");
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
    void premiumAndEntitledVisitorsAreNotLimited() {
        String premium = uniqueUid("views-premium");
        UUID premiumId = provisionCompliant(premium);
        testUsers.update("UPDATE user_account SET plan_code = 'PREMIUM' WHERE id = ?", premiumId);
        for (int index = 0; index < binderIds.size(); index++) {
            callJson(HttpMethod.GET, view(index), premium, null, 200);
        }

        String entitled = uniqueUid("views-entitled");
        UUID entitledId = provisionCompliant(entitled);
        String admin = uniqueUid("views-admin");
        provisionWithRoles(admin, Role.ADMIN);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + entitledId + "/entitlements",
                admin,
                Map.of("featureKey", "binder.views.per_day", "value", "unlimited"),
                201);
        for (int index = 0; index < binderIds.size(); index++) {
            callJson(HttpMethod.GET, view(index), entitled, null, 200);
        }
    }
}
