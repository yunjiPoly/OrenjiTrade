package com.orenjitrade.api.ratings.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** {@code moderation_state} of ratings and references. */
@Schema(name = "RatingModerationState")
public enum RatingModerationState {
    /** Shown on the collector's profile and counted in the summary. */
    OK,
    /** Hidden by a moderator (audited): not shown, not counted. */
    HIDDEN
}
