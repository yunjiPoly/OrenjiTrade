package com.orenjitrade.api.delisting.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Why a collector's public listings are paused ({@code user_responsiveness.pause_source}). */
@Schema(name = "ListingPauseSource")
public enum PauseSource {
    /**
     * The nightly delist job: unanswered conversations (strikes) reached the policy's maxStrikes.
     * The owner resumes by confirming ({@code POST /me/listings/resume}).
     */
    UNRESPONSIVE,
    /** Open reports from distinct reporters crossed the REPORT_THRESHOLD rule; pending review. */
    REPORT_THRESHOLD,
    /** A moderator resolved a report with the LISTINGS_PAUSED action. */
    MODERATION,
    /** An admin paused the listings ({@code POST /admin/users/{id}/pause-listings}). */
    ADMIN;

    /** Whether the owner may lift the pause themselves by confirming. */
    public boolean ownerCanResume() {
        return this == UNRESPONSIVE;
    }
}
