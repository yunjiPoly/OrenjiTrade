package com.orenjitrade.api.delisting.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.delisting.domain.DelistPolicyView;
import com.orenjitrade.api.delisting.domain.FreshnessPolicy;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** A delist (freshness) policy as shown in the admin console. */
@Schema(name = "DelistPolicyResponse", description = "Auto-delist freshness policy")
public record DelistPolicyResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Default") String name,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean active,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "15") int agingAfterDays,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "31") int staleAfterDays,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "46") int hiddenAfterDays,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "5") int warnBeforeHiddenDays,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "3") int maxStrikes,
        @Schema(nullable = true, description = "Last admin editor; null for the default")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable UUID updatedBy,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        example = "72",
                        description =
                                "Hours after which a conversation waiting for the owner's answer"
                                        + " counts as unanswered (one strike each)")
                int unansweredAfterHours) {

    static DelistPolicyResponse from(DelistPolicyView view) {
        FreshnessPolicy policy = view.policy();
        return new DelistPolicyResponse(
                policy.id(),
                policy.name(),
                view.active(),
                policy.agingAfterDays(),
                policy.staleAfterDays(),
                policy.hiddenAfterDays(),
                policy.warnBeforeHiddenDays(),
                policy.maxStrikes(),
                policy.updatedBy(),
                policy.updatedAt(),
                policy.unansweredAfterHours());
    }
}
