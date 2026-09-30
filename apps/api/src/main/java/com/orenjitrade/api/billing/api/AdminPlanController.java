package com.orenjitrade.api.billing.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.billing.domain.PlanFeatureRule;
import com.orenjitrade.api.billing.domain.PlanRules;
import com.orenjitrade.api.billing.domain.PlanService;
import com.orenjitrade.api.billing.infra.PlanRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/plans} and {@code /api/v1/admin/usage-limits}: read (ADMIN, SUPER_ADMIN),
 * change (SUPER_ADMIN). Changes are audited and take effect at once (cache evicted).
 */
@RestController
@Tag(name = "admin-plans", description = "Plans and usage limits (admin console)")
@Validated
public class AdminPlanController {

    private final PlanService planService;

    public AdminPlanController(PlanService planService) {
        this.planService = planService;
    }

    @GetMapping(path = "/api/v1/admin/plans", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "listAdminPlans",
            summary = "List plans with features and limits (ADMIN, SUPER_ADMIN)",
            description = "Active and inactive plans, by sort order.")
    public List<PlanRules> plans() {
        return planService.all();
    }

    @PutMapping(
            path = "/api/v1/admin/plans/{code}",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updatePlan",
            summary = "Change a plan (SUPER_ADMIN)",
            description =
                    "Name, description, display price, active flag, order and feature switches"
                            + " (listed features are upserted). FREE cannot be disabled. Audited"
                            + " (`plan.update`).")
    public PlanRules updatePlan(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable @Pattern(regexp = "^[A-Z][A-Z0-9_]{1,31}$") String code,
            @Valid @RequestBody UpdatePlanRequest body) {
        List<PlanFeatureRule> features =
                body.features() == null
                        ? List.of()
                        : body.features().stream()
                                .map(
                                        feature ->
                                                new PlanFeatureRule(
                                                        feature.key(),
                                                        feature.enabled(),
                                                        feature.value()))
                                .toList();
        return planService.updatePlan(
                actor,
                code,
                new PlanService.PlanUpdate(
                        body.name(),
                        body.description(),
                        body.monthlyPrice(),
                        body.currency(),
                        body.active(),
                        body.sortOrder(),
                        features));
    }

    @GetMapping(path = "/api/v1/admin/usage-limits", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "listUsageLimits",
            summary = "List usage limits (ADMIN, SUPER_ADMIN)",
            description = "Every limit of every plan (optionally one plan), by plan then key.")
    public List<AdminUsageLimit> usageLimits(
            @Parameter(description = "Plan code filter, e.g. FREE")
                    @RequestParam(required = false)
                    @Pattern(regexp = "^[A-Z][A-Z0-9_]{1,31}$")
                    @Nullable String plan) {
        return planService.all().stream()
                .filter(rules -> plan == null || rules.code().equals(plan))
                .flatMap(
                        rules ->
                                rules.limits().stream()
                                        .map(limit -> AdminUsageLimit.from(rules.code(), limit)))
                .toList();
    }

    @PutMapping(
            path = "/api/v1/admin/usage-limits/{id}",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateUsageLimit",
            summary = "Change a usage limit (SUPER_ADMIN)",
            description =
                    "Live edit: every instance applies the new value at once (cache evicted);"
                            + " counters keep their usage. Audited (`usage_limit.update`).")
    public AdminUsageLimit updateUsageLimit(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateUsageLimitRequest body) {
        PlanRepository.LockedLimit updated =
                planService.updateLimit(
                        actor,
                        id,
                        Boolean.TRUE.equals(body.unlimited()) ? null : body.maxValue(),
                        body.window(),
                        body.description());
        return AdminUsageLimit.from(updated.planCode(), updated.limit());
    }
}
