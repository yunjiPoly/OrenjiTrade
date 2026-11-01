package com.orenjitrade.api.limits.api;

import com.orenjitrade.api.auth.domain.AccountNames;
import com.orenjitrade.api.auth.domain.AccountNames.AccountName;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.limits.domain.UsageLimitRule;
import com.orenjitrade.api.limits.domain.UsageLimitService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/usage-limits}: read (ADMIN, SUPER_ADMIN), change (SUPER_ADMIN). One limit
 * per key, the same for every collector (ADR 0019). Changes are audited and take effect at once
 * (cache evicted).
 */
@RestController
@Tag(name = "admin-usage-limits", description = "Usage limits (admin console)")
@Validated
public class AdminUsageLimitController {

    private final UsageLimitService usageLimits;
    private final AccountNames accountNames;

    public AdminUsageLimitController(UsageLimitService usageLimits, AccountNames accountNames) {
        this.usageLimits = usageLimits;
        this.accountNames = accountNames;
    }

    @GetMapping(path = "/api/v1/admin/usage-limits", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "listUsageLimits",
            summary = "List usage limits (ADMIN, SUPER_ADMIN)",
            description = "Every usage limit, by key. Each applies to every collector alike.")
    public List<AdminUsageLimit> usageLimits() {
        List<UsageLimitRule> rules = usageLimits.all();
        Map<UUID, AccountName> editors =
                accountNames.namesOf(
                        rules.stream()
                                .map(UsageLimitRule::updatedBy)
                                .filter(Objects::nonNull)
                                .collect(Collectors.toSet()));
        return rules.stream()
                .map(
                        rule ->
                                AdminUsageLimit.from(
                                        rule,
                                        rule.updatedBy() == null
                                                ? null
                                                : editors.get(rule.updatedBy())))
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
                    "Live edit for every collector: every instance applies the new value at once"
                            + " (cache evicted); counters keep their usage. Audited"
                            + " (`usage_limit.update`).")
    public AdminUsageLimit updateUsageLimit(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateUsageLimitRequest body) {
        UsageLimitRule rule =
                usageLimits.updateLimit(
                        actor,
                        id,
                        Boolean.TRUE.equals(body.unlimited()) ? null : body.maxValue(),
                        body.window(),
                        body.description());
        return AdminUsageLimit.from(rule, accountNames.nameOf(rule.updatedBy()).orElse(null));
    }
}
