package com.orenjitrade.api.reports.domain;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.domain.BinderView;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.community.domain.CommunityService;
import com.orenjitrade.api.messaging.domain.ConversationService;
import com.orenjitrade.api.moderation.domain.ModerationScope;
import com.orenjitrade.api.moderation.domain.ModerationService;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.profiles.domain.MemberDirectory;
import com.orenjitrade.api.reports.events.CollectorReported;
import com.orenjitrade.api.reports.infra.ReportRepository;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Collector reporting (Phase 7 contract "Collector reporting"). The only reportable subject is a
 * collector:
 *
 * <ul>
 *   <li>{@code 422 CANNOT_REPORT_SELF}, {@code 404} for unknown or deleted collectors, {@code 409
 *       REPORT_ALREADY_OPEN} while the caller's previous report against the same collector is OPEN
 *       or UNDER_REVIEW, {@code 429 RATE_LIMITED} beyond the REPORT rate rule (5 per day by
 *       default, {@code moderation_rule});
 *   <li>the context must be the caller's own surface with the collector: a conversation between
 *       them, one of the collector's posts or binders ({@code 400} otherwise);
 *   <li>an {@code Idempotency-Key} repeats the original answer for 24 hours;
 *   <li>{@link CollectorReported} is published in the transaction (threshold check, analytics).
 * </ul>
 */
@Service
public class CollectorReportService {

    public static final int DETAILS_MAX = 1000;
    public static final int MINE_LIMIT = 100;
    static final Duration IDEMPOTENCY_TTL = Duration.ofHours(24);
    static final String IDEMPOTENCY_PREFIX = "idem:report:";
    static final Pattern IDEMPOTENCY_KEY = Pattern.compile("^[A-Za-z0-9_.:-]{1,100}$");

    private static final Logger log = LoggerFactory.getLogger(CollectorReportService.class);

    private final ReportRepository reports;
    private final UserAccountService accounts;
    private final ConversationService conversations;
    private final CommunityService community;
    private final BinderService binders;
    private final ModerationService moderation;
    private final MemberDirectory members;
    private final StringRedisTemplate redis;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;

    public CollectorReportService(
            ReportRepository reports,
            UserAccountService accounts,
            ConversationService conversations,
            CommunityService community,
            BinderService binders,
            ModerationService moderation,
            MemberDirectory members,
            StringRedisTemplate redis,
            ApplicationEventPublisher events,
            TimeProvider timeProvider) {
        this.reports = reports;
        this.accounts = accounts;
        this.conversations = conversations;
        this.community = community;
        this.binders = binders;
        this.moderation = moderation;
        this.members = members;
        this.redis = redis;
        this.events = events;
        this.timeProvider = timeProvider;
    }

    /** {@code GET /public/report-reasons}: every reason in dialog order. */
    public List<ReportReason> reasons() {
        return List.of(ReportReason.values());
    }

    /**
     * {@code POST /reports/collectors} (see the class comment).
     *
     * @return the report and whether it was created by this call (false for an idempotent repeat)
     */
    @Transactional
    public Filed file(
            UUID me,
            UUID reportedUserId,
            ReportReason reason,
            @Nullable String rawDetails,
            @Nullable ReportContext rawContext,
            @Nullable String idempotencyKey) {
        @Nullable String key = idempotencyKey(idempotencyKey);
        if (key != null) {
            Optional<ReportRow> previous = previousFor(me, key);
            if (previous.isPresent()) {
                return new Filed(previous.get(), false);
            }
        }
        if (me.equals(reportedUserId)) {
            throw new ApiException(ErrorCode.CANNOT_REPORT_SELF, "You cannot report yourself");
        }
        @Nullable String details =
                rawDetails == null || rawDetails.isBlank() ? null : rawDetails.strip();
        if (details != null && details.length() > DETAILS_MAX) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("details", "must be at most 1000 characters")));
        }
        UserAccountSnapshot reported =
                accounts.findSnapshot(reportedUserId)
                        .filter(
                                account ->
                                        account.status() != AccountStatus.DELETED
                                                && account.status()
                                                        != AccountStatus.DELETION_REQUESTED)
                        .orElseThrow(() -> ApiException.notFound("Collector not found"));
        ReportContext context = validContext(me, reported.id(), rawContext);
        Optional<ReportRow> open = reports.findOpen(me, reported.id());
        if (open.isPresent()) {
            throw alreadyOpen(open.get());
        }
        checkRate(me);
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        UUID id = UUID.randomUUID();
        if (!reports.insertIfNoneOpen(id, me, reported.id(), reason, details, context, now)) {
            throw alreadyOpen(reports.findOpen(me, reported.id()).orElse(null));
        }
        events.publishEvent(
                new CollectorReported(
                        id, me, reported.id(), reason.name(), context.source().name(), now));
        log.info("Collector report {} filed ({})", id, reason);
        if (key != null) {
            remember(me, key, id);
        }
        return new Filed(reports.find(id).orElseThrow(), true);
    }

    /** {@code GET /me/reports}: the caller's reports, newest first (status only). */
    @Transactional(readOnly = true)
    public List<MyReport> mine(UUID me) {
        List<ReportRow> rows = reports.byReporter(me, MINE_LIMIT);
        Map<UUID, MemberCard> cards =
                members.cards(rows.stream().map(ReportRow::reportedUserId).distinct().toList());
        return rows.stream()
                .map(row -> new MyReport(row, cards.get(row.reportedUserId())))
                .toList();
    }

    /**
     * One of the caller's reports with the reported collector's card.
     *
     * @param report the report
     * @param reported the reported collector ({@code null} when unknown)
     */
    public record MyReport(ReportRow report, @Nullable MemberCard reported) {}

    /** Counts the report against the REPORT rate rule (429 RATE_LIMITED beyond it). */
    private void checkRate(UUID me) {
        try {
            moderation.check(ModerationScope.REPORT, null, me);
        } catch (ApiException e) {
            if (e.getErrorCode() != ErrorCode.RATE_LIMITED) {
                throw e;
            }
            ApiException limited =
                    new ApiException(
                            ErrorCode.RATE_LIMITED,
                            "You reached the limit of reports for now. Please try again later.");
            Object retryAfter = e.getProperties().get("retryAfterSeconds");
            if (retryAfter != null) {
                limited.withProperty("retryAfterSeconds", retryAfter);
            }
            throw limited;
        }
    }

    private ReportContext validContext(UUID me, UUID reportedId, @Nullable ReportContext context) {
        if (context == null) {
            return ReportContext.PROFILE;
        }
        List<ProblemFieldError> errors = new ArrayList<>();
        ReportContext result =
                switch (context.source()) {
                    case PROFILE -> ReportContext.PROFILE;
                    case CONVERSATION -> {
                        UUID conversationId = context.conversationId();
                        if (conversationId == null) {
                            errors.add(
                                    new ProblemFieldError(
                                            "context.conversationId",
                                            "is required for CONVERSATION reports"));
                        } else if (!Set.of(me, reportedId)
                                .equals(
                                        new HashSet<>(
                                                conversations.participantIds(conversationId)))) {
                            errors.add(
                                    new ProblemFieldError(
                                            "context.conversationId",
                                            "must be a conversation between you and this"
                                                    + " collector"));
                        }
                        yield new ReportContext(
                                ReportContext.Source.CONVERSATION, conversationId, null, null);
                    }
                    case POST -> {
                        UUID postId = context.postId();
                        if (postId == null) {
                            errors.add(
                                    new ProblemFieldError(
                                            "context.postId", "is required for POST reports"));
                        } else if (!community
                                .postAuthor(postId)
                                .map(reportedId::equals)
                                .orElse(false)) {
                            errors.add(
                                    new ProblemFieldError(
                                            "context.postId",
                                            "must be a community post of this collector"));
                        }
                        yield new ReportContext(ReportContext.Source.POST, null, postId, null);
                    }
                    case BINDER -> {
                        UUID binderId = context.binderId();
                        if (binderId == null) {
                            errors.add(
                                    new ProblemFieldError(
                                            "context.binderId", "is required for BINDER reports"));
                        } else {
                            @Nullable BinderView binder =
                                    binders.findAll(List.of(binderId)).get(binderId);
                            if (binder == null || !binder.ownerId().equals(reportedId)) {
                                errors.add(
                                        new ProblemFieldError(
                                                "context.binderId",
                                                "must be a binder of this collector"));
                            }
                        }
                        yield new ReportContext(ReportContext.Source.BINDER, null, null, binderId);
                    }
                };
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        return result;
    }

    private static ApiException alreadyOpen(@Nullable ReportRow open) {
        ApiException problem =
                new ApiException(
                        ErrorCode.REPORT_ALREADY_OPEN,
                        "You already reported this collector; the moderation team is reviewing"
                                + " it");
        if (open != null) {
            problem.withProperty("reportId", open.id());
        }
        return problem;
    }

    private static @Nullable String idempotencyKey(@Nullable String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String key = raw.trim();
        if (!IDEMPOTENCY_KEY.matcher(key).matches()) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    "Idempotency-Key",
                                    "must be 1 to 100 letters, digits or . _ : -")));
        }
        return key;
    }

    private Optional<ReportRow> previousFor(UUID me, String key) {
        try {
            @Nullable String stored = redis.opsForValue().get(IDEMPOTENCY_PREFIX + me + ":" + key);
            if (stored == null) {
                return Optional.empty();
            }
            return reports.find(UUID.fromString(stored)).filter(row -> row.reporterId().equals(me));
        } catch (RuntimeException e) {
            log.debug("Idempotency lookup failed: {}", e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    private void remember(UUID me, String key, UUID reportId) {
        try {
            redis.opsForValue()
                    .set(IDEMPOTENCY_PREFIX + me + ":" + key, reportId.toString(), IDEMPOTENCY_TTL);
        } catch (RuntimeException e) {
            log.debug("Idempotency store failed: {}", e.getClass().getSimpleName());
        }
    }

    /** Export section: the reports the account filed (their own view: status, no notes). */
    @Transactional(readOnly = true)
    public List<Map<String, @Nullable Object>> export(UUID userId) {
        List<Map<String, @Nullable Object>> result = new ArrayList<>();
        for (ReportRow row : reports.byReporter(userId, 1000)) {
            Map<String, @Nullable Object> entry = new java.util.LinkedHashMap<>();
            entry.put("id", row.id());
            entry.put("reason", row.reason().name());
            entry.put("details", row.details());
            entry.put("status", row.status().name());
            entry.put("createdAt", row.createdAt());
            result.add(entry);
        }
        return result;
    }

    /** Deletion: erases the free text of the account's decided reports. */
    @Transactional
    public void purge(UUID userId) {
        reports.eraseResolvedDetailsOf(userId);
    }

    /**
     * Result of {@link #file}.
     *
     * @param report the stored report
     * @param created whether this call created it
     */
    public record Filed(ReportRow report, boolean created) {}
}
