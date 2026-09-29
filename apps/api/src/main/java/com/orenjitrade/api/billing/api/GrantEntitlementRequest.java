package com.orenjitrade.api.billing.api;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * Body of {@code POST /api/v1/admin/users/{id}/entitlements}.
 *
 * @param featureKey a limit key ({@code binder.views.per_day}) or feature key ({@code
 *     filters.advanced}) defined by the plans
 * @param value limits: a non-negative integer or {@code unlimited} (default); features: {@code
 *     true} (default) or {@code false}
 * @param expiresAt optional end of validity (future)
 * @param note optional admin note (never shown to the user)
 */
@Schema(description = "Entitlement grant")
public record GrantEntitlementRequest(
        @NotBlank @Size(max = 64) @Schema(example = "binder.views.per_day") String featureKey,
        @Size(max = 200) @Schema(example = "unlimited") @Nullable String value,
        @Nullable Instant expiresAt,
        @Size(max = 500) @Nullable String note) {}
