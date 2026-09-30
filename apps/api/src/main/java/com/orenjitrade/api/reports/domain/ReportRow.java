package com.orenjitrade.api.reports.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A stored collector report.
 *
 * @param id report id
 * @param reporterId who reported
 * @param reportedUserId the reported collector
 * @param reason why
 * @param details the reporter's free text (moderators only)
 * @param context where it was reported
 * @param status lifecycle state
 * @param createdAt filed at
 * @param updatedAt last change
 * @param assignedTo moderator in charge
 * @param assignedAt when assigned
 * @param resolvedAt decision time
 * @param resolvedBy deciding moderator
 * @param resolutionNote moderator note of the decision (moderators only)
 * @param resolutionAction the decision
 */
public record ReportRow(
        UUID id,
        UUID reporterId,
        UUID reportedUserId,
        ReportReason reason,
        @Nullable String details,
        ReportContext context,
        ReportStatus status,
        Instant createdAt,
        Instant updatedAt,
        @Nullable UUID assignedTo,
        @Nullable Instant assignedAt,
        @Nullable Instant resolvedAt,
        @Nullable UUID resolvedBy,
        @Nullable String resolutionNote,
        @Nullable ResolutionAction resolutionAction) {}
