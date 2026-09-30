package com.orenjitrade.api.billing.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.billing.domain.Entitlements;
import com.orenjitrade.api.billing.domain.Limits;
import com.orenjitrade.api.billing.domain.PlanCodes;
import com.orenjitrade.api.billing.domain.PlanService;
import com.orenjitrade.api.billing.domain.SubscriptionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/plans} (public) and {@code GET /api/v1/me/plan}. */
@RestController
@Tag(name = "plans", description = "Plans, usage limits and entitlements (freemium)")
public class PlanController {

    private final PlanService planService;
    private final Limits limits;
    private final Entitlements entitlements;
    private final SubscriptionService subscriptions;

    public PlanController(
            PlanService planService,
            Limits limits,
            Entitlements entitlements,
            SubscriptionService subscriptions) {
        this.planService = planService;
        this.limits = limits;
        this.entitlements = entitlements;
        this.subscriptions = subscriptions;
    }

    @GetMapping(path = "/api/v1/plans", produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "listPlans",
            summary = "Active plans with features and limits (public)",
            description = "Ordered for display (FREE first). `limit` null means unlimited.")
    public List<PlanResponse> plans() {
        return planService.active().stream().map(PlanResponse::from).toList();
    }

    @GetMapping(path = "/api/v1/me/plan", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getMyPlan",
            summary = "The caller's plan, limits with usage, features and entitlements",
            description =
                    "Limits carry the effective value (entitlements override the plan), the usage"
                        + " of the current window and when it resets (UTC day or month; null for"
                        + " totals and caps). subscription is the live subscription (PENDING"
                        + " checkout, TRIAL, ACTIVE or PAST_DUE), absent otherwise.")
    public MyPlanResponse myPlan(@AuthenticationPrincipal AuthenticatedUser user) {
        return new MyPlanResponse(
                PlanResponse.from(planService.planOf(user.userId())),
                limits.overview(user.userId()),
                entitlements.features(user.userId()),
                entitlements.active(user.userId()).stream()
                        .map(MyPlanResponse.MyEntitlement::from)
                        .toList(),
                PlanCodes.UPGRADE_URL,
                subscriptions
                        .live(user.userId())
                        .map(SubscriptionResponses.MySubscription::from)
                        .orElse(null));
    }
}
