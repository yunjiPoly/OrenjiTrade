package com.orenjitrade.api.delisting.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.delisting.domain.ResponsivenessSource.UnansweredConversation;
import com.orenjitrade.api.delisting.infra.ResponsivenessRepository;
import com.orenjitrade.api.jobs.domain.JobRunService;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * The nightly {@code delist} job (Phase 3 contract "Jobs", Phase 7 "Strikes"):
 *
 * <ol>
 *   <li>collects the conversations waiting for an answer ({@link ResponsivenessSource}, implemented
 *       by the messaging module): the other participant's last message was sent within the last
 *       {@value #WINDOW_DAYS} days and at least {@code delist_policy.unanswered_after_hours} ago;
 *   <li>stores per collector {@code unanswered_conversations_30d} and the strikes (the unanswered
 *       conversations waiting since after the owner's last resume) in {@code user_responsiveness};
 *   <li>pauses the public listings of collectors whose strikes reached {@code
 *       delist_policy.max_strikes} and who have something public (source UNRESPONSIVE; the owner
 *       resumes by confirming);
 *   <li>clears timed pauses that ended.
 * </ol>
 *
 * Never deletes anything. Each pause runs in its own transaction; the run is recorded in {@code
 * job_run}.
 */
@Component
public class DelistJob {

    public static final String NAME = "delist";
    public static final int WINDOW_DAYS = 30;

    private static final Logger log = LoggerFactory.getLogger(DelistJob.class);

    private final JobRunService jobRunService;
    private final DelistPolicyService policies;
    private final ResponsivenessRepository repository;
    private final ListingPauseService pauses;
    private final List<ResponsivenessSource> sources;
    private final TimeProvider timeProvider;

    public DelistJob(
            JobRunService jobRunService,
            DelistPolicyService policies,
            ResponsivenessRepository repository,
            ListingPauseService pauses,
            List<ResponsivenessSource> sources,
            TimeProvider timeProvider) {
        this.jobRunService = jobRunService;
        this.policies = policies;
        this.repository = repository;
        this.pauses = pauses;
        this.sources = List.copyOf(sources);
        this.timeProvider = timeProvider;
    }

    public Result run() {
        Map<String, ?> details = jobRunService.run(NAME, this::execute);
        return new Result(
                ((Number) details.get("ownersEvaluated")).intValue(),
                ((Number) details.get("listingsPaused")).intValue(),
                ((Number) details.get("ownersWithStrikes")).intValue(),
                ((Number) details.get("pausesExpired")).intValue());
    }

    private Map<String, ?> execute() {
        FreshnessPolicy policy = policies.active();
        Instant now = timeProvider.now();
        Instant from = now.minus(Duration.ofDays(WINDOW_DAYS));
        Instant to = policy.unansweredCutoff(now);

        Map<UUID, List<Instant>> waiting = new HashMap<>();
        for (ResponsivenessSource source : sources) {
            for (UnansweredConversation conversation : source.unansweredBetween(from, to)) {
                waiting.computeIfAbsent(conversation.userId(), id -> new ArrayList<>())
                        .add(conversation.waitingSince());
            }
        }
        Map<UUID, Instant> resets = repository.strikeResets(waiting.keySet());
        List<UUID> struck = new ArrayList<>();
        int ownersWithStrikes = 0;
        for (Map.Entry<UUID, List<Instant>> entry : waiting.entrySet()) {
            int strikes = strikes(entry.getValue(), resets.get(entry.getKey()));
            repository.saveStrikes(entry.getKey(), entry.getValue().size(), strikes, now);
            if (strikes > 0) {
                ownersWithStrikes++;
            }
            if (strikes >= policy.maxStrikes()) {
                struck.add(entry.getKey());
            }
        }
        repository.clearStrikesExcept(waiting.keySet(), now);

        int paused = 0;
        for (UUID userId : struck) {
            try {
                if (pauses.isPaused(userId) || !repository.hasPublicListings(userId)) {
                    continue;
                }
                Map<String, Object> audit = new LinkedHashMap<>();
                audit.put("strikes", strikes(waiting.get(userId), resets.get(userId)));
                audit.put("maxStrikes", policy.maxStrikes());
                if (pauses.pause(
                        userId,
                        PauseSource.UNRESPONSIVE,
                        "Unanswered conversations reached the policy limit",
                        null,
                        ActorType.SYSTEM,
                        null,
                        audit)) {
                    paused++;
                }
            } catch (RuntimeException e) {
                log.warn("Could not pause the listings of {}: {}", userId, e.getMessage());
            }
        }
        int expired = pauses.expirePauses();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("maxStrikes", policy.maxStrikes());
        result.put("unansweredAfterHours", policy.unansweredAfterHours());
        result.put("ownersEvaluated", waiting.size());
        result.put("ownersWithStrikes", ownersWithStrikes);
        result.put("listingsPaused", paused);
        result.put("pausesExpired", expired);
        result.put("strikeTracking", true);
        return result;
    }

    /** Unanswered conversations waiting since after the owner's last resume (pure). */
    public static int strikes(List<Instant> waitingSince, @Nullable Instant resetAt) {
        if (resetAt == null) {
            return waitingSince.size();
        }
        int strikes = 0;
        for (Instant since : waitingSince) {
            if (since.isAfter(resetAt)) {
                strikes++;
            }
        }
        return strikes;
    }

    /**
     * Outcome of one run.
     *
     * @param ownersEvaluated collectors with at least one unanswered conversation
     * @param listingsPaused collectors whose public listings were paused by this run
     * @param ownersWithStrikes collectors with at least one strike
     * @param pausesExpired timed pauses that ended
     */
    public record Result(
            int ownersEvaluated, int listingsPaused, int ownersWithStrikes, int pausesExpired) {}
}
