package com.orenjitrade.api.messaging.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

/**
 * The photo of an IMAGE message (re-encoded JPEG without metadata).
 *
 * @param url image URL (unguessable key)
 * @param width pixels
 * @param height pixels
 */
@Schema(name = "MessageImage", description = "Photo of an IMAGE message")
public record MessageImage(
        @Schema(requiredMode = RequiredMode.REQUIRED) String url,
        @Schema(requiredMode = RequiredMode.REQUIRED) int width,
        @Schema(requiredMode = RequiredMode.REQUIRED) int height) {}
