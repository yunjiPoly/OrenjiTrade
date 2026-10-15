package com.orenjitrade.api.binders.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.UUID;

/**
 * A key card of a deck core: one card of the catalogue with the copies the core holds of it (every
 * printing together), built from the binder's items (public items only in public views).
 *
 * @param cardId catalogue card
 * @param name card name
 * @param quantity copies in the core
 */
@Schema(name = "BinderKeyCard", description = "A card of a deck core and its copies")
public record KeyCard(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID cardId,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Tidecaller Mermaid") String name,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "3") int quantity) {}
