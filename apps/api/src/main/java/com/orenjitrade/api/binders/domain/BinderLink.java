package com.orenjitrade.api.binders.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.UUID;

/**
 * A public binder shared in a private message or a community post (Phase 5).
 *
 * @param id binder id (link target: the public binder page)
 * @param name binder name at the time it was shared
 * @param ownerHandle handle of the owner at the time it was shared
 */
@Schema(name = "BinderLink", description = "A public binder shared in a message or post")
public record BinderLink(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Yu-Gi-Oh! trade binder")
                String name,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "collector1") String ownerHandle) {}
