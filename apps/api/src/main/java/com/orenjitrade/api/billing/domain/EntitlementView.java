package com.orenjitrade.api.billing.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A per-user override of a plan feature or limit ({@code entitlement}).
 *
 * @param id entitlement id
 * @param userId the account
 * @param featureKey feature key ({@code filters.advanced}) or limit key ({@code
 *     binder.views.per_day})
 * @param value features: {@code true}/{@code false} ({@code null} = true); limits: a number ({@code
 *     null} = unlimited)
 * @param source origin
 * @param expiresAt end of validity, {@code null} = no expiry
 * @param grantedBy admin who granted it
 * @param note admin note
 * @param createdAt grant time
 * @param revokedAt revocation time, {@code null} while not revoked
 */
@Schema(name = "Entitlement", description = "Per-user override of a plan feature or limit")
public record EntitlementView(
        UUID id,
        UUID userId,
        @Schema(example = "binder.views.per_day") String featureKey,
        @Schema(
                        description =
                                "Features: true/false (null = true). Limits: a number (null ="
                                        + " unlimited)")
                @Nullable String value,
        EntitlementSource source,
        @Nullable Instant expiresAt,
        @Nullable UUID grantedBy,
        @Nullable String note,
        Instant createdAt,
        @Nullable Instant revokedAt) {

    /** Not revoked and not expired at {@code now}. */
    public boolean activeAt(Instant now) {
        return revokedAt == null && (expiresAt == null || expiresAt.isAfter(now));
    }
}
