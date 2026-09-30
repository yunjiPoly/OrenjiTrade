package com.orenjitrade.api.delisting.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.delisting.events.ListingsPaused;
import com.orenjitrade.api.delisting.events.ListingsResumed;
import com.orenjitrade.api.delisting.infra.ResponsivenessRepository;
import com.orenjitrade.api.delisting.infra.ResponsivenessRepository.Row;
import com.orenjitrade.api.users.domain.UserAccountService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Pauses of a collector's public listings (Phase 7 contract "Auto-delisting"): never a deletion,
 * only the effective public visibility ({@link ListingPauseRules}). Every pause and resume is
 * audited ({@value #ACTION_PAUSE}, {@value #ACTION_RESUME}, target USER) in the caller's
 * transaction and publishes {@link ListingsPaused} / {@link ListingsResumed} so the inventory
 * module re-evaluates the listings and the owner is told.
 *
 * <p>Sources ({@link PauseSource}): the nightly job (UNRESPONSIVE, the owner resumes by
 * confirming), the report threshold (REPORT_THRESHOLD, pending review), a moderator decision
 * (MODERATION) and admins (ADMIN, optionally until a date).
 */
@Service
public class ListingPauseService {

    public static final String ACTION_PAUSE = "listings.pause";
    public static final String ACTION_RESUME = "listings.resume";
    static final int REASON_MAX = 500;

    private final ResponsivenessRepository repository;
    private final DelistPolicyService policies;
    private final UserAccountService accounts;
    private final AuditService auditService;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;

    public ListingPauseService(
            ResponsivenessRepository repository,
            DelistPolicyService policies,
            UserAccountService accounts,
            AuditService auditService,
            ApplicationEventPublisher events,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.policies = policies;
        this.accounts = accounts;
        this.auditService = auditService;
        this.events = events;
        this.timeProvider = timeProvider;
    }

    // ---------------------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------------------

    /** The listing health of a collector (defaults when never evaluated). */
    @Transactional(readOnly = true)
    public ListingStatus status(UUID userId) {
        Instant now = timeProvider.now();
        int maxStrikes = policies.active().maxStrikes();
        Optional<Row> row = repository.find(userId);
        if (row.isEmpty()) {
            return new ListingStatus(userId, false, null, null, null, null, 0, 0, maxStrikes, null);
        }
        Row current = row.get();
        boolean paused = ListingPauseRules.isPaused(current.pausedAt(), current.pausedUntil(), now);
        return new ListingStatus(
                userId,
                paused,
                paused ? current.source() : null,
                paused ? current.reason() : null,
                paused ? current.pausedAt() : null,
                paused ? current.pausedUntil() : null,
                current.strikes(),
                current.unanswered(),
                maxStrikes,
                current.evaluatedAt());
    }

    /** Whether a pause is in force for the collector. */
    @Transactional(readOnly = true)
    public boolean isPaused(UUID userId) {
        Instant now = timeProvider.now();
        return repository
                .find(userId)
                .map(row -> ListingPauseRules.isPaused(row.pausedAt(), row.pausedUntil(), now))
                .orElse(false);
    }

    /** Owners with a pause in force (admin dashboard). */
    @Transactional(readOnly = true)
    public long pausedOwnerCount() {
        return repository.countPaused(timeProvider.now());
    }

    // ---------------------------------------------------------------------------------------
    // Writes used by other modules and the job
    // ---------------------------------------------------------------------------------------

    /**
     * Pauses (or re-labels an existing pause of) the collector's public listings. Audited;
     * publishes {@link ListingsPaused} only when the listings were not paused before.
     *
     * @param extraDetails additional audit details (e.g. {@code reportId}, {@code strikes})
     * @return whether the listings were newly paused
     */
    @Transactional
    public boolean pause(
            UUID userId,
            PauseSource source,
            @Nullable String reason,
            @Nullable Instant until,
            ActorType actorType,
            @Nullable UUID actorId,
            Map<String, ?> extraDetails) {
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        Row current = repository.lock(userId, now);
        boolean wasPaused =
                ListingPauseRules.isPaused(current.pausedAt(), current.pausedUntil(), now);
        @Nullable String text = clean(reason);
        Instant pausedAt = wasPaused && current.pausedAt() != null ? current.pausedAt() : now;
        repository.setPause(userId, source, text, until, actorId, pausedAt, now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("source", source.name());
        if (text != null) {
            details.put("reason", text);
        }
        if (until != null) {
            details.put("until", until.toString());
        }
        if (wasPaused && current.source() != null && current.source() != source) {
            details.put("previousSource", current.source().name());
        }
        details.putAll(extraDetails);
        auditService.record(
                actorType,
                actorId,
                ACTION_PAUSE,
                AuditService.TARGET_USER,
                userId.toString(),
                details);
        if (!wasPaused) {
            Object strikes = extraDetails.get("strikes");
            events.publishEvent(
                    new ListingsPaused(
                            userId,
                            source.name(),
                            strikes instanceof Number number ? number.intValue() : null,
                            now));
        }
        return !wasPaused;
    }

    /**
     * Lifts the pause of the collector's listings when one is in force (audited, publishes {@link
     * ListingsResumed}).
     *
     * @return whether a pause was lifted
     */
    @Transactional
    public boolean resume(
            UUID userId,
            ActorType actorType,
            @Nullable UUID actorId,
            @Nullable String note,
            Map<String, ?> extraDetails) {
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        Row current = repository.lock(userId, now);
        if (!ListingPauseRules.isPaused(current.pausedAt(), current.pausedUntil(), now)
                || current.source() == null) {
            return false;
        }
        repository.clearPause(userId, now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("source", current.source().name());
        @Nullable String text = clean(note);
        if (text != null) {
            details.put("note", text);
        }
        details.putAll(extraDetails);
        auditService.record(
                actorType,
                actorId,
                ACTION_RESUME,
                AuditService.TARGET_USER,
                userId.toString(),
                details);
        events.publishEvent(new ListingsResumed(userId, current.source().name(), now));
        return true;
    }

    /**
     * Lifts a pause only when it came from the report threshold (the review is over without a
     * sanction on the listings).
     *
     * @return whether a pause was lifted
     */
    @Transactional
    public boolean liftReviewPause(
            UUID userId, ActorType actorType, @Nullable UUID actorId, Map<String, ?> details) {
        Instant now = timeProvider.now();
        Optional<Row> row = repository.find(userId);
        if (row.isEmpty()
                || row.get().source() != PauseSource.REPORT_THRESHOLD
                || !ListingPauseRules.isPaused(
                        row.get().pausedAt(), row.get().pausedUntil(), now)) {
            return false;
        }
        return resume(userId, actorType, actorId, "Review completed", details);
    }

    /** The source of the pause in force, if any. */
    @Transactional(readOnly = true)
    public Optional<PauseSource> activeSource(UUID userId) {
        Instant now = timeProvider.now();
        return repository
                .find(userId)
                .filter(row -> ListingPauseRules.isPaused(row.pausedAt(), row.pausedUntil(), now))
                .map(Row::source);
    }

    /** Clears timed pauses that ended (delist job); returns their number. */
    @Transactional
    public int expirePauses() {
        Instant now = timeProvider.now();
        int expired = 0;
        for (Row row : repository.expiredPauses(now)) {
            PauseSource source = row.source();
            repository.clearPause(row.userId(), now);
            auditService.record(
                    ActorType.SYSTEM,
                    null,
                    ACTION_RESUME,
                    AuditService.TARGET_USER,
                    row.userId().toString(),
                    Map.of("source", source == null ? "UNKNOWN" : source.name(), "expired", true));
            events.publishEvent(
                    new ListingsResumed(
                            row.userId(), source == null ? "UNKNOWN" : source.name(), now));
            expired++;
        }
        return expired;
    }

    // ---------------------------------------------------------------------------------------
    // Owner and admin endpoints
    // ---------------------------------------------------------------------------------------

    /**
     * {@code POST /me/listings/resume}: the owner confirms they are responsive again. Only pauses
     * of the delist job (UNRESPONSIVE) can be lifted this way ({@code 409} otherwise); strikes
     * restart from zero.
     */
    @Transactional
    public ListingStatus resumeByOwner(UUID userId) {
        Instant now = timeProvider.now();
        Row current = repository.lock(userId, now);
        if (!ListingPauseRules.isPaused(current.pausedAt(), current.pausedUntil(), now)) {
            throw ApiException.conflict("Your public listings are not paused");
        }
        if (current.source() == null || !current.source().ownerCanResume()) {
            throw ApiException.conflict(
                    "Your public listings are paused pending a review by the moderation team");
        }
        resume(userId, ActorType.USER, userId, null, Map.of());
        repository.resetStrikes(userId, now);
        return status(userId);
    }

    /**
     * {@code POST /admin/users/{id}/pause-listings}: {@code 404} unknown account, {@code 409}
     * already paused, {@code 400} for an end in the past.
     */
    @Transactional
    public ListingStatus adminPause(
            AuthenticatedUser actor, UUID userId, String reason, @Nullable Instant until) {
        requireAccount(userId);
        Instant now = timeProvider.now();
        if (until != null && !until.isAfter(now)) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("until", "must be in the future")));
        }
        if (isPaused(userId)) {
            throw ApiException.conflict("The collector's listings are already paused");
        }
        pause(userId, PauseSource.ADMIN, reason, until, ActorType.ADMIN, actor.userId(), Map.of());
        return status(userId);
    }

    /** {@code POST /admin/users/{id}/resume-listings}: {@code 409} when nothing is paused. */
    @Transactional
    public ListingStatus adminResume(AuthenticatedUser actor, UUID userId, @Nullable String note) {
        requireAccount(userId);
        if (!resume(userId, ActorType.ADMIN, actor.userId(), note, Map.of())) {
            throw ApiException.conflict("The collector's listings are not paused");
        }
        return status(userId);
    }

    /** Admin read of a collector's listing health ({@code 404} unknown account). */
    @Transactional(readOnly = true)
    public ListingStatus adminStatus(UUID userId) {
        requireAccount(userId);
        return status(userId);
    }

    private void requireAccount(UUID userId) {
        if (accounts.findSnapshot(userId).isEmpty()) {
            throw ApiException.notFound("Account not found");
        }
    }

    private static @Nullable String clean(@Nullable String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        String trimmed = text.trim();
        return trimmed.length() <= REASON_MAX ? trimmed : trimmed.substring(0, REASON_MAX);
    }
}
