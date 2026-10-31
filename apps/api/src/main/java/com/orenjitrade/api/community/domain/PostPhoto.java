package com.orenjitrade.api.community.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

/**
 * A photo of a community post (stage R11): a re-encoded JPEG without EXIF or GPS data.
 *
 * @param url image URL (unguessable key)
 * @param width pixels
 * @param height pixels
 */
@Schema(name = "PostPhoto", description = "A photo of a community post (no EXIF or GPS data)")
public record PostPhoto(
        @Schema(requiredMode = RequiredMode.REQUIRED) String url,
        @Schema(requiredMode = RequiredMode.REQUIRED) int width,
        @Schema(requiredMode = RequiredMode.REQUIRED) int height) {}
