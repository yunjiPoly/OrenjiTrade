package com.orenjitrade.api.reports.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.IdentityAdminClient;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.delisting.domain.ListingPauseService;
import com.orenjitrade.api.delisting.domain.PauseSource;
import com.orenjitrade.api.messaging.domain.ConversationService;
import com.orenjitrade.api.messaging.domain.ConversationService.ModerationMessage;
import com.orenjitrade.api.moderation.domain.FlagReason;
import com.orenjitrade.api.moderation.domain.ModerationService;
import com.orenjitrade.api.notifications.domain.NotificationRequest;
import com.orenjitrade.api.notifications.domain.NotificationService;
import com.orenjitrade.api.notifications.domain.NotificationType;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.profiles.domain.MemberDirectory;
import com.orenjitrade.api.reports.domain.ModerationHistoryService.ModerationHistory;
import com.orenjitrade.api.reports.infra.ReportRepository;
import com.orenjitrade.api.reports.infra.ReportRepository.NoteRow;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Report review for moderators and admins (Phase 7 contract): list, detail with the reported
 * collector's history, assignment, internal notes and resolution. A resolution applies its action
 * (warning notice, listing pause, suspension with an optional end, ban = suspension without end
 * plus the ban mark), writes the audit entry {@value #ACTION_RESOLVE} (details with the action) in
 * the same transaction and, when asked, tells the reporter through a REPORT_DECISION notification
 * without specifics. Suspensions and bans need ADMIN or SUPER_ADMIN; an administrator's account
 * needs a SUPER_ADMIN. When no report against the collector is open any more and the decision is
 * NONE or WARNING, the review pause of the report threshold is lifted and its flags resolved.
 *
 * <p>Private messages: the detail shows the messages of the conversation named by the report's
 * context only (audited {@value #ACTION_VIEW_CONVERSATION}), never any other conversation.
 */
@Service
public class AdminReportService {

    public static final String ACTION_RESOLVE = "REPORT_RESOLVED";
    public static final String ACTION_ASSIGN = "report.assign";
    public static final String ACTION_NOTE = "report.note";
    public static final String ACTION_VIEW_CONVERSATION = "report.conversation.view";
    public static final String ACTION_SUSPEND = "user.suspend";
    public static final String ACTION_BAN = "user.ban";
    public static final String TARGET_REPORT = "REPORT";
    public static final int CONVERSATION_MESSAGES = 50;
    static final int NOTE_MAX = 2000;
    static final String NOT_FOUND = "Report not found";

    private final ReportRepository reports;
    private final ModerationHistoryService history;
    private final UserAccountService accounts;
    private final IdentityAdminClient identityAdmin;
    private final MemberDirectory members;
    private final ConversationService conversations;
    private final ListingPauseService pauses;
    private final ModerationService moderation;
    private final NotificationService notifications;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public AdminReportService(
            ReportRepository reports,
            ModerationHistoryService history,
            UserAccountService accounts,
            IdentityAdminClient identityAdmin,
            MemberDirectory members,
            ConversationService conversations,
            ListingPauseService pauses,
            ModerationService moderation,
            NotificationService notifications,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.reports = reports;
        this.history = history;
        this.accounts = accounts;
        this.identityAdmin = identityAdmin;
        this.members = members;
        this.conversations = conversations;
        this.pauses = pauses;
        this.moderation = moderation;
        this.notifications = notifications;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    // ---------------------------------------------------------------------------------------
    // Reading
    // ---------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public PageResponse<ReportSummaryView> list(
            @Nullable ReportStatus status,
            @Nullable ReportReason reason,
            @Nullable UUID reportedUserId,
            @Nullable UUID assignedTo,
            int page,
            int size) {
        ReportRepository.Page result =
                reports.adminPage(status, reason, reportedUserId, assignedTo, page, size);
        return PageResponse.of(summaries(result.rows()), page, size, result.total());
    }

    /**
     * The detail of a report: parties, context, notes, the reported collector's history and, when
     * the context names a conversation, that conversation's latest messages (the access is
     * audited).
     */
    @Transactional
    public ReportDetailView detail(AuthenticatedUser actor, UUID id) {
        ReportRow report = reports.find(id).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        List<NoteRow> noteRows = reports.notesOf(id);
        Set<UUID> ids = new LinkedHashSet<>();
        ids.add(report.reporterId());
        ids.add(report.reportedUserId());
        if (report.assignedTo() != null) {
            ids.add(report.assignedTo());
        }
        noteRows.stream()
                .map(NoteRow::authorId)
                .filter(java.util.Objects::nonNull)
                .forEach(ids::add);
        Map<UUID, MemberCard> cards = members.cards(ids);
        List<NoteView> notes =
                noteRows.stream()
                        .map(
                                note ->
                                        new NoteView(
                                                note,
                                                note.authorId() == null
                                                        ? null
                                                        : cards.get(note.authorId())))
                        .toList();
        @Nullable List<ModerationMessage> messages = null;
        UUID conversationId = report.context().conversationId();
        if (conversationId != null) {
            messages = conversations.messagesForModeration(conversationId, CONVERSATION_MESSAGES);
            auditService.record(
                    ActorType.ADMIN,
                    actor.userId(),
                    ACTION_VIEW_CONVERSATION,
                    TARGET_REPORT,
                    id.toString(),
                    Map.of("conversationId", conversationId.toString()));
        }
        UserAccountSnapshot reported =
                accounts.findSnapshot(report.reportedUserId())
                        .orElseThrow(() -> ApiException.notFound("Account not found"));
        return new ReportDetailView(
                report,
                cards.get(report.reporterId()),
                cards.get(report.reportedUserId()),
                reported,
                report.assignedTo() == null ? null : cards.get(report.assignedTo()),
                notes,
                history.historyOf(report.reportedUserId()),
                conversationId,
                messages);
    }

    // ---------------------------------------------------------------------------------------
    // Writing
    // ---------------------------------------------------------------------------------------

    /**
     * {@code POST /admin/reports/{id}/assign}: assigns the report (to the caller by default, or to
     * another moderator); OPEN becomes UNDER_REVIEW. {@code 409} for decided reports, {@code 400}
     * when the assignee is not a moderator. Audited.
     */
    @Transactional
    public ReportSummaryView assign(AuthenticatedUser actor, UUID id, @Nullable UUID assigneeId) {
        ReportRow report = requireOpen(id);
        UUID assignee = assigneeId == null ? actor.userId() : assigneeId;
        if (!assignee.equals(actor.userId())) {
            boolean moderator =
                    accounts.findSnapshot(assignee)
                            .filter(account -> account.status() == AccountStatus.ACTIVE)
                            .map(
                                    account ->
                                            account.hasAnyRole(
                                                    Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN))
                            .orElse(false);
            if (!moderator) {
                throw ApiException.validation(
                        "Validation failed",
                        List.of(
                                new ProblemFieldError(
                                        "assigneeId", "must be an active moderator")));
            }
        }
        reports.assign(id, assignee, timeProvider.now());
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("assigneeId", assignee.toString());
        details.put("previousStatus", report.status().name());
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_ASSIGN,
                TARGET_REPORT,
                id.toString(),
                details);
        return summaries(List.of(reports.find(id).orElseThrow())).get(0);
    }

    /** {@code POST /admin/reports/{id}/notes}: an internal note (audited without its text). */
    @Transactional
    public NoteView addNote(AuthenticatedUser actor, UUID id, String rawBody) {
        if (reports.find(id).isEmpty()) {
            throw ApiException.notFound(NOT_FOUND);
        }
        String body = rawBody == null ? "" : rawBody.strip();
        if (body.isEmpty() || body.length() > NOTE_MAX) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("body", "must be 1 to 2000 characters")));
        }
        UUID noteId = UUID.randomUUID();
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        reports.insertNote(noteId, id, actor.userId(), body, now);
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_NOTE,
                TARGET_REPORT,
                id.toString(),
                Map.of("noteId", noteId.toString()));
        NoteRow note = new NoteRow(noteId, id, actor.userId(), body, now);
        return new NoteView(note, members.card(actor.userId()).orElse(null));
    }

    /** {@code POST /admin/reports/{id}/resolve} (see the class comment). */
    @Transactional
    public ReportSummaryView resolve(AuthenticatedUser actor, UUID id, Resolution resolution) {
        ReportRow report = requireOpen(id);
        ResolutionAction action = validate(resolution);
        if (action.needsAdmin() && !actor.isAdmin()) {
            throw ApiException.forbidden("Only an ADMIN can suspend or ban an account");
        }
        UUID reportedId = report.reportedUserId();
        if (reportedId.equals(actor.userId())) {
            throw ApiException.conflict("You cannot decide a report about yourself");
        }
        UserAccountSnapshot reported =
                accounts.findSnapshot(reportedId)
                        .orElseThrow(() -> ApiException.notFound("Account not found"));
        String note = resolution.note().strip();
        Instant now = timeProvider.now();
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("status", resolution.status().name());
        details.put("action", action.name());
        details.put("reportedUserId", reportedId.toString());
        details.put("reason", report.reason().name());
        details.put("notifyReporter", resolution.notifyReporter());

        switch (action) {
            case NONE -> {}
            case WARNING -> warn(report);
            case LISTINGS_PAUSED ->
                    pauses.pause(
                            reportedId,
                            PauseSource.MODERATION,
                            note,
                            null,
                            ActorType.ADMIN,
                            actor.userId(),
                            Map.of("reportId", id.toString()));
            case SUSPENDED -> {
                requireSuspendable(actor, reported);
                accounts.suspend(reportedId, note, resolution.suspendUntil());
                Map<String, Object> suspension = new LinkedHashMap<>();
                suspension.put("reason", note);
                if (resolution.suspendUntil() != null) {
                    suspension.put("until", resolution.suspendUntil().toString());
                    details.put("suspendUntil", resolution.suspendUntil().toString());
                }
                suspension.put("previousStatus", reported.status().name());
                suspension.put("reportId", id.toString());
                auditService.record(
                        ActorType.ADMIN,
                        actor.userId(),
                        ACTION_SUSPEND,
                        AuditService.TARGET_USER,
                        reportedId.toString(),
                        suspension);
                identityAdmin.disableUser(reported.providerUid());
            }
            case BANNED -> {
                requireSuspendable(actor, reported);
                accounts.ban(reportedId, note);
                Map<String, Object> ban = new LinkedHashMap<>();
                ban.put("reason", note);
                ban.put("previousStatus", reported.status().name());
                ban.put("reportId", id.toString());
                auditService.record(
                        ActorType.ADMIN,
                        actor.userId(),
                        ACTION_BAN,
                        AuditService.TARGET_USER,
                        reportedId.toString(),
                        ban);
                identityAdmin.disableUser(reported.providerUid());
            }
        }
        reports.resolve(id, resolution.status(), action, note, actor.userId(), now);

        if (reports.openAgainst(reportedId) == 0) {
            int flags =
                    moderation.resolveAccountFlags(
                            reportedId,
                            FlagReason.REPORT_THRESHOLD,
                            actor.userId(),
                            "Reports reviewed");
            if (flags > 0) {
                details.put("thresholdFlagsResolved", flags);
            }
            if ((action == ResolutionAction.NONE || action == ResolutionAction.WARNING)
                    && pauses.liftReviewPause(
                            reportedId,
                            ActorType.ADMIN,
                            actor.userId(),
                            Map.of("reportId", id.toString()))) {
                details.put("reviewPauseLifted", true);
            }
        }
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_RESOLVE,
                TARGET_REPORT,
                id.toString(),
                details);
        if (resolution.notifyReporter()) {
            notifyReporter(report, resolution.status());
        }
        return summaries(List.of(reports.find(id).orElseThrow())).get(0);
    }

    private ReportRow requireOpen(UUID id) {
        ReportRow report =
                reports.findForUpdate(id).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        if (!report.status().isOpen()) {
            throw ApiException.conflict("This report is already decided");
        }
        return report;
    }

    /** The effective action; {@code 400} for inconsistent combinations. */
    static ResolutionAction validate(Resolution resolution) {
        List<ProblemFieldError> errors = new ArrayList<>();
        ResolutionAction action =
                resolution.action() != null ? resolution.action() : ResolutionAction.NONE;
        switch (resolution.status()) {
            case ACTIONED -> {
                if (action == ResolutionAction.NONE) {
                    errors.add(new ProblemFieldError("action", "is required for ACTIONED"));
                }
            }
            case DISMISSED -> {
                if (action != ResolutionAction.NONE) {
                    errors.add(new ProblemFieldError("action", "must be NONE for DISMISSED"));
                }
            }
            default -> errors.add(new ProblemFieldError("status", "must be ACTIONED or DISMISSED"));
        }
        String note = resolution.note() == null ? "" : resolution.note().strip();
        if (note.isEmpty() || note.length() > 1000) {
            errors.add(new ProblemFieldError("note", "must be 1 to 1000 characters"));
        }
        if (resolution.suspendUntil() != null && action != ResolutionAction.SUSPENDED) {
            errors.add(new ProblemFieldError("suspendUntil", "is only allowed with SUSPENDED"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        return action;
    }

    private void requireSuspendable(AuthenticatedUser actor, UserAccountSnapshot target) {
        if (target.hasAnyRole(Role.ADMIN, Role.SUPER_ADMIN) && !actor.hasRole(Role.SUPER_ADMIN)) {
            throw ApiException.forbidden("Only a SUPER_ADMIN can suspend an administrator");
        }
        if (target.status() == AccountStatus.DELETED) {
            throw ApiException.conflict("The account is deleted");
        }
    }

    private void warn(ReportRow report) {
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        data.put("kind", "MODERATION_WARNING");
        data.put("deepLink", "/legal/community-guidelines");
        notifications.notify(
                new NotificationRequest(
                        report.reportedUserId(),
                        NotificationType.SYSTEM,
                        "A warning from the moderation team",
                        "Our moderation team reviewed a report about your activity and issued a"
                                + " warning. Please review the Community Guidelines; repeated"
                                + " issues can lead to paused listings or a suspension.",
                        data,
                        "report-warning:" + report.id()));
    }

    private void notifyReporter(ReportRow report, ReportStatus status) {
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        data.put("reportId", report.id().toString());
        data.put("status", status.name());
        data.put("deepLink", "/settings/reports");
        String body =
                status == ReportStatus.ACTIONED
                        ? "Thanks for your report. Our moderation team reviewed it and took"
                                + " action."
                        : "Thanks for your report. Our moderation team reviewed it and did not"
                                + " find a violation of the Community Guidelines.";
        notifications.notify(
                new NotificationRequest(
                        report.reporterId(),
                        NotificationType.REPORT_DECISION,
                        "Your report was reviewed",
                        body,
                        data,
                        "report-decision:" + report.id()));
    }

    private List<ReportSummaryView> summaries(List<ReportRow> rows) {
        Set<UUID> ids = new LinkedHashSet<>();
        List<UUID> reported = new ArrayList<>();
        for (ReportRow row : rows) {
            ids.add(row.reporterId());
            ids.add(row.reportedUserId());
            reported.add(row.reportedUserId());
            if (row.assignedTo() != null) {
                ids.add(row.assignedTo());
            }
        }
        Map<UUID, MemberCard> cards = members.cards(ids);
        Map<UUID, Integer> open = reports.openAgainst(reported.stream().distinct().toList());
        return rows.stream()
                .map(
                        row ->
                                new ReportSummaryView(
                                        row,
                                        cards.get(row.reporterId()),
                                        cards.get(row.reportedUserId()),
                                        row.assignedTo() == null
                                                ? null
                                                : cards.get(row.assignedTo()),
                                        open.getOrDefault(row.reportedUserId(), 0)))
                .toList();
    }

    /**
     * A decision.
     *
     * @param status ACTIONED or DISMISSED
     * @param action the action (NONE for DISMISSED)
     * @param note moderator note (stored, audited as reason of suspensions)
     * @param notifyReporter whether the reporter gets a REPORT_DECISION notification
     * @param suspendUntil optional end of a SUSPENDED decision
     */
    public record Resolution(
            ReportStatus status,
            @Nullable ResolutionAction action,
            String note,
            boolean notifyReporter,
            @Nullable Instant suspendUntil) {}

    /** A report with its parties' cards and the open reports against the reported collector. */
    public record ReportSummaryView(
            ReportRow report,
            @Nullable MemberCard reporter,
            @Nullable MemberCard reported,
            @Nullable MemberCard assignee,
            int openReportsAgainstUser) {}

    /** A moderator note with its author's card. */
    public record NoteView(NoteRow note, @Nullable MemberCard author) {}

    /** Everything a moderator needs to decide a report. */
    public record ReportDetailView(
            ReportRow report,
            @Nullable MemberCard reporter,
            @Nullable MemberCard reportedCard,
            UserAccountSnapshot reportedAccount,
            @Nullable MemberCard assignee,
            List<NoteView> notes,
            ModerationHistory history,
            @Nullable UUID conversationId,
            @Nullable List<ModerationMessage> messages) {}
}
