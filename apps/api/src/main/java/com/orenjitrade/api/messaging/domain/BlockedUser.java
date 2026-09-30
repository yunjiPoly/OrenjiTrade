package com.orenjitrade.api.messaging.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A collector the caller blocked ({@code GET /me/blocks}).
 *
 * @param id account id
 * @param handle handle
 * @param displayName display name
 * @param avatarUrl avatar
 * @param blockedAt when the block was created
 */
@Schema(name = "BlockedUser", description = "A collector blocked by the caller")
public record BlockedUser(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "collector6") String handle,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Ethan Walsh") String displayName,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String avatarUrl,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant blockedAt) {}
