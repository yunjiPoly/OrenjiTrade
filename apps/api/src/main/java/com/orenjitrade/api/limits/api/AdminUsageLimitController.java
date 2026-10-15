package com.orenjitrade.api.limits.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.limits.domain.UsageLimitService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
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

    public AdminUsageLimitController(UsageLimitService usageLimits) {
        this.usageLimits = usageLimits;
    }

    @GetMapping(path = "/api/v1/admin/usage-limits", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "listUsageLimits",
            summary = "List usage limits (ADMIN, SUPER_ADMIN)",
            description = "Every usage limit, by key. Each applies to every collector alike.")
    public List<AdminUsageLimit> usageLimits() {
        return usageLimits.all().stream().map(AdminUsageLimit::from).toList();
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
        return AdminUsageLimit.from(
                usageLimits.updateLimit(
                        actor,
                        id,
                        Boolean.TRUE.equals(body.unlimited()) ? null : body.maxValue(),
                        body.window(),
                        body.description()));
    }
}
