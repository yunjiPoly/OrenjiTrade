package com.orenjitrade.api.messaging.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.UUID;

/**
 * Result of {@code POST /uploads/images}.
 *
 * @param uploadId pass as {@code imageUploadId} when sending an IMAGE message
 * @param url preview URL of the re-encoded image
 * @param width pixels
 * @param height pixels
 * @param expiresAt the upload is deleted when not attached before this instant (1 h)
 */
@Schema(name = "ImageUploadResponse", description = "A re-encoded image waiting to be attached")
public record ImageUploadView(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID uploadId,
        @Schema(requiredMode = RequiredMode.REQUIRED) String url,
        @Schema(requiredMode = RequiredMode.REQUIRED) int width,
        @Schema(requiredMode = RequiredMode.REQUIRED) int height,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant expiresAt) {}
