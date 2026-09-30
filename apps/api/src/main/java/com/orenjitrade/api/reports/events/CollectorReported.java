package com.orenjitrade.api.reports.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published inside the transaction that stored a collector report (Spring Modulith registry): the
 * reports module checks the report threshold, the analytics module counts it. Never carries the
 * reporter's details.
 *
 * @param reportId the report
 * @param reporterId who reported
 * @param reportedUserId the reported collector
 * @param reason reason name
 * @param contextSource context source name (PROFILE, CONVERSATION, POST, BINDER)
 * @param occurredAt when
 */
public record CollectorReported(
        UUID reportId,
        UUID reporterId,
        UUID reportedUserId,
        String reason,
        String contextSource,
        Instant occurredAt) {}
