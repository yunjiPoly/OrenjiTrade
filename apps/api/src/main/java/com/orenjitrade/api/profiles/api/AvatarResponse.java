package com.orenjitrade.api.profiles.api;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

/** Response of {@code POST /api/v1/me/profile/avatar}. */
@Schema(name = "AvatarResponse")
public record AvatarResponse(
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        format = "uri",
                        description = "Public URL of the 512x512 avatar (immutable)")
                String avatarUrl) {}
