package com.orenjitrade.api.inventory.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.UUID;

/**
 * An owner photo of an item (re-encoded JPEG, metadata stripped).
 *
 * @param id image id
 * @param url public URL (derived from the storage key)
 * @param width pixels
 * @param height pixels
 * @param sortOrder position
 */
@Schema(name = "InventoryItemImage", description = "Owner photo of an inventory item")
public record ItemImage(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, format = "uri") String url,
        @Schema(requiredMode = RequiredMode.REQUIRED) int width,
        @Schema(requiredMode = RequiredMode.REQUIRED) int height,
        @Schema(requiredMode = RequiredMode.REQUIRED) int sortOrder) {}
