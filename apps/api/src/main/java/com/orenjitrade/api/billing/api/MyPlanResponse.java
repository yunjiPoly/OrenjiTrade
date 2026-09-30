package com.orenjitrade.api.billing.api;

import com.orenjitrade.api.billing.domain.EntitlementSource;
import com.orenjitrade.api.billing.domain.EntitlementView;
import com.orenjitrade.api.billing.domain.LimitDecision;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * {@code GET /me/plan}: the caller's plan, the effective limits with current usage and reset times,
 * the effective features, the active entitlements and the live subscription (Phase 10).
 *
 * @param plan the plan whose rules apply
 * @param limits every limit of the plan with entitlement overrides applied
 * @param features effective feature switches by key
 * @param entitlements active entitlements
 * @param upgradeUrl where to send the user to upgrade
 * @param subscription the live subscription (checkout in progress or entitling), if any
 */
@Schema(name = "MyPlan", description = "The caller's plan, limits, features and entitlements")
public record MyPlanResponse(
        PlanResponse plan,
        List<LimitDecision> limits,
        @Schema(example = "{\"filters.advanced\":false,\"ads.enabled\":true}")
                Map<String, Boolean> features,
        List<MyEntitlement> entitlements,
        @Schema(example = "/premium") String upgradeUrl,
        SubscriptionResponses.@Nullable MySubscription subscription) {

    /**
     * An active entitlement as its owner sees it (no admin note, no granting admin).
     *
     * @param id entitlement id
     * @param featureKey feature or limit key
     * @param value override value
     * @param source origin
     * @param expiresAt end of validity
     * @param grantedAt grant time
     */
    @Schema(name = "MyEntitlement", description = "Active entitlement of the caller")
    public record MyEntitlement(
            UUID id,
            String featureKey,
            @Nullable String value,
            EntitlementSource source,
            @Nullable Instant expiresAt,
            Instant grantedAt) {

        public static MyEntitlement from(EntitlementView view) {
            return new MyEntitlement(
                    view.id(),
                    view.featureKey(),
                    view.value(),
                    view.source(),
                    view.expiresAt(),
                    view.createdAt());
        }
    }
}
