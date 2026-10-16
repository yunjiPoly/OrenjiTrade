package com.orenjitrade.api.binders.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.UUID;

/**
 * A photo of a binder: the photos of a deck core (stage R3), re-encoded as a JPEG without any
 * metadata, at most {@value BinderService#MAX_PHOTOS} per binder.
 *
 * @param id photo id
 * @param url public URL (derived from the storage key)
 * @param width pixels
 * @param height pixels
 * @param sortOrder position
 */
@Schema(name = "BinderImage", description = "A photo of a binder (a deck core)")
public record BinderPhoto(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, format = "uri") String url,
        @Schema(requiredMode = RequiredMode.REQUIRED) int width,
        @Schema(requiredMode = RequiredMode.REQUIRED) int height,
        @Schema(requiredMode = RequiredMode.REQUIRED) int sortOrder) {}
