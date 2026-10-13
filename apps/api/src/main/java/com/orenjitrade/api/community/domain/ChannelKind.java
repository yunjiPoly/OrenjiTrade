package com.orenjitrade.api.community.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Kind of a community channel (Phase 5 contract). */
@Schema(name = "CommunityChannelKind")
public enum ChannelKind {
    GAME,
    /** A platform region (ADR 0017); the former city channels are archived. */
    REGION,
    LOOKING_FOR,
    NEW_LISTINGS,
    TRADES,
    GENERAL
}
