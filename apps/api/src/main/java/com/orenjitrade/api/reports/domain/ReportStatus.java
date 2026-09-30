package com.orenjitrade.api.reports.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Lifecycle of a collector report: OPEN → UNDER_REVIEW → ACTIONED | DISMISSED. */
@Schema(name = "ReportStatus")
public enum ReportStatus {
    OPEN,
    UNDER_REVIEW,
    ACTIONED,
    DISMISSED;

    /** Whether the report still waits for a decision. */
    public boolean isOpen() {
        return this == OPEN || this == UNDER_REVIEW;
    }
}
