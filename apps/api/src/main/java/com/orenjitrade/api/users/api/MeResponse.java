package com.orenjitrade.api.users.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.users.domain.OnboardingStatus;
import com.orenjitrade.api.users.domain.RequiredConsent;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Response of {@code GET /api/v1/me} (Phase 1 contract, "Identity and session"). */
@Schema(name = "MeResponse", description = "The calling collector's own account")
public record MeResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "maika") String handle,
        @Schema(nullable = true, example = "Maïka Tremblay")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String displayName,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable String email,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean emailVerified,
        @Schema(requiredMode = RequiredMode.REQUIRED) Set<Role> roles,
        @Schema(requiredMode = RequiredMode.REQUIRED) AccountStatus status,
        @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String avatarUrl,
        @Schema(requiredMode = RequiredMode.REQUIRED, format = "date-time") Instant createdAt,
        @Schema(nullable = true, format = "date-time") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant lastActiveAt,
        @Schema(requiredMode = RequiredMode.REQUIRED) OnboardingStatus onboarding,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description =
                                "Current legal document versions still to accept; while non-empty"
                                        + " every non-exempt route answers 428")
                List<RequiredConsent> requiredConsents,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "FREE") String plan,
        @Schema(
                        nullable = true,
                        example = "americas-north",
                        description =
                                "Platform region of the collector's declared location (ADR 0017);"
                                        + " null without a location. Clients browse it by default")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String homeRegion) {}
