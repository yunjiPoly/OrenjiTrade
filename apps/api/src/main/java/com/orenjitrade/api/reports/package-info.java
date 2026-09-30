/**
 * Reports module.
 *
 * <p>Collector reports filed by users (reason required) and their review lifecycle OPEN ->
 * UNDER_REVIEW -> ACTIONED/DISMISSED (Phase 7): {@code CollectorReportService} (reasons, filing
 * with context validation, 409 REPORT_ALREADY_OPEN, 422 CANNOT_REPORT_SELF, the REPORT rate rule,
 * Idempotency-Key), {@code ReportThresholdService} (open reports from distinct reporters flag the
 * collector and pause their listings pending review, never a ban), {@code AdminReportService}
 * (queue, detail, assignment, notes, decisions applying warnings, listing pauses, suspensions and
 * bans, audited, REPORT_DECISION notifications) and {@code ModerationHistoryService}. Publishes
 * {@code CollectorReported}. Reads private messages only of the conversation a report names.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Reports")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.reports;
