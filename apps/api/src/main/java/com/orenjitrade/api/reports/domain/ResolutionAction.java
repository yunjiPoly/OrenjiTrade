package com.orenjitrade.api.reports.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** What a moderator decided on a report ({@code collector_report.resolution_action}). */
@Schema(name = "ReportResolutionAction")
public enum ResolutionAction {
    /** No action (DISMISSED reports). */
    NONE,
    /** A warning notice to the reported collector. */
    WARNING,
    /** The reported collector's public listings are paused (source MODERATION). */
    LISTINGS_PAUSED,
    /** The account is suspended (optionally until a date); ADMIN or SUPER_ADMIN only. */
    SUSPENDED,
    /** A suspension without end plus the ban mark; ADMIN or SUPER_ADMIN only. */
    BANNED;

    /** Whether only an ADMIN or SUPER_ADMIN may decide it. */
    public boolean needsAdmin() {
        return this == SUSPENDED || this == BANNED;
    }
}
