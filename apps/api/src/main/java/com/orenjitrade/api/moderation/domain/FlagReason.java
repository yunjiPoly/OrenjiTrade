package com.orenjitrade.api.moderation.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Why a flag was raised. */
@Schema(name = "FlagReason")
public enum FlagReason {
    /** A FLAG banned-term rule matched the text. */
    BANNED_TERM,
    /** A FLAG rate rule was exceeded by the author. */
    RATE_THRESHOLD,
    /** The author repeated the same text more often than a THRESHOLD rule allows. */
    REPEATED_CONTENT
}
