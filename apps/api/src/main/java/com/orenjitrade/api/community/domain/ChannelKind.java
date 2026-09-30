package com.orenjitrade.api.community.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Kind of a community channel (Phase 5 contract). */
@Schema(name = "CommunityChannelKind")
public enum ChannelKind {
    GAME,
    /** A city (optionally per game, e.g. "Montréal / Pokémon"). */
    REGION,
    LOOKING_FOR,
    NEW_LISTINGS,
    TRADES,
    GENERAL
}
