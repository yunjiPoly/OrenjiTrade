package com.orenjitrade.api.community.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A community channel as members see it ({@code GET /community/channels}).
 *
 * @param id channel id
 * @param slug URL slug
 * @param name display name
 * @param kind kind
 * @param game game slug of game channels and per-game region channels
 * @param regionLabel platform region code of region channels (ADR 0017)
 * @param description description
 * @param postCount24h visible posts of the last 24 hours
 */
@Schema(name = "CommunityChannel", description = "A public community channel")
public record ChannelView(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "montreal-pokemon") String slug,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Montréal / Pokémon") String name,
        @Schema(requiredMode = RequiredMode.REQUIRED) ChannelKind kind,
        @Schema(nullable = true, example = "pokemon") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String game,
        @Schema(nullable = true, example = "Montréal") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String regionLabel,
        @Schema(requiredMode = RequiredMode.REQUIRED) String description,
        @Schema(requiredMode = RequiredMode.REQUIRED) int postCount24h) {}
