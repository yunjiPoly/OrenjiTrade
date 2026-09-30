package com.orenjitrade.api.moderation.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** What a {@code moderation_flag} points at. */
@Schema(name = "FlagSubjectType")
public enum FlagSubjectType {
    /** A private message (moderators read it only when acting on a report, Phase 7). */
    MESSAGE,
    COMMUNITY_POST,
    COMMUNITY_REPLY,
    /** An account that crossed a rate threshold or the report threshold (Phase 7). */
    USER
}
