package com.orenjitrade.api.delisting.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The active auto-delist policy ({@code delist_policy}, ADR 0014) and the pure freshness rules
 * derived from it. With the seeded policy: ACTIVE 0-14 days since {@code confirmed_at}, AGING
 * 15-30, STALE 31-45, HIDDEN 46+, warning 5 days before hiding (from day 41).
 *
 * <p>An age of {@code n} days means {@code confirmed_at <= now - n days}; the SQL of the binders
 * and inventory modules uses the same cut-offs ({@link #agingCutoff}, {@link #staleCutoff}, {@link
 * #hiddenCutoff}, {@link #warnCutoff}) so Java and the database always agree.
 *
 * @param id policy id
 * @param name display name
 * @param agingAfterDays first day of AGING
 * @param staleAfterDays first day of STALE
 * @param hiddenAfterDays first day of HIDDEN
 * @param warnBeforeHiddenDays warning lead time
 * @param maxStrikes unresponsiveness strikes before listings are paused (delist job)
 * @param updatedBy last admin editor, {@code null} for the migration default
 * @param updatedAt last change
 * @param unansweredAfterHours how long the other participant's last message must wait before a
 *     conversation counts as unanswered (strikes, Phase 7)
 */
public record FreshnessPolicy(
        UUID id,
        String name,
        int agingAfterDays,
        int staleAfterDays,
        int hiddenAfterDays,
        int warnBeforeHiddenDays,
        int maxStrikes,
        @Nullable UUID updatedBy,
        Instant updatedAt,
        int unansweredAfterHours) {

    /** Default of {@link #unansweredAfterHours} (the V062 column default). */
    public static final int DEFAULT_UNANSWERED_AFTER_HOURS = 72;

    /** A policy with the default unanswered window. */
    public FreshnessPolicy(
            UUID id,
            String name,
            int agingAfterDays,
            int staleAfterDays,
            int hiddenAfterDays,
            int warnBeforeHiddenDays,
            int maxStrikes,
            @Nullable UUID updatedBy,
            Instant updatedAt) {
        this(
                id,
                name,
                agingAfterDays,
                staleAfterDays,
                hiddenAfterDays,
                warnBeforeHiddenDays,
                maxStrikes,
                updatedBy,
                updatedAt,
                DEFAULT_UNANSWERED_AFTER_HOURS);
    }

    /** Conversations waiting for an answer since this instant or earlier count as unanswered. */
    public Instant unansweredCutoff(Instant now) {
        return now.minus(Duration.ofHours(unansweredAfterHours));
    }

    /** The state of a listing last confirmed at {@code confirmedAt}. */
    public FreshnessState stateAt(Instant confirmedAt, Instant now) {
        if (!confirmedAt.isAfter(hiddenCutoff(now))) {
            return FreshnessState.HIDDEN;
        }
        if (!confirmedAt.isAfter(staleCutoff(now))) {
            return FreshnessState.STALE;
        }
        if (!confirmedAt.isAfter(agingCutoff(now))) {
            return FreshnessState.AGING;
        }
        return FreshnessState.ACTIVE;
    }

    /** Whether a public listing confirmed at {@code confirmedAt} is due for its warning. */
    public boolean isInWarningWindow(Instant confirmedAt, Instant now) {
        return !confirmedAt.isAfter(warnCutoff(now)) && confirmedAt.isAfter(hiddenCutoff(now));
    }

    /** When a listing confirmed at {@code confirmedAt} is hidden. */
    public Instant hidesAt(Instant confirmedAt) {
        return confirmedAt.plus(Duration.ofDays(hiddenAfterDays));
    }

    /** Listings confirmed at or before this instant are at least AGING. */
    public Instant agingCutoff(Instant now) {
        return now.minus(Duration.ofDays(agingAfterDays));
    }

    /** Listings confirmed at or before this instant are at least STALE. */
    public Instant staleCutoff(Instant now) {
        return now.minus(Duration.ofDays(staleAfterDays));
    }

    /** Listings confirmed at or before this instant are HIDDEN. */
    public Instant hiddenCutoff(Instant now) {
        return now.minus(Duration.ofDays(hiddenAfterDays));
    }

    /** Public listings confirmed at or before this instant (and not hidden yet) are warned. */
    public Instant warnCutoff(Instant now) {
        return now.minus(Duration.ofDays((long) hiddenAfterDays - warnBeforeHiddenDays));
    }
}
