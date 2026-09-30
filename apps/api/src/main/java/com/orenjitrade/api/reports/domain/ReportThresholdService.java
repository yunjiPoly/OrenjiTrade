package com.orenjitrade.api.reports.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.delisting.domain.ListingPauseService;
import com.orenjitrade.api.delisting.domain.PauseSource;
import com.orenjitrade.api.moderation.domain.FlagReason;
import com.orenjitrade.api.moderation.domain.ModerationAction;
import com.orenjitrade.api.moderation.domain.ModerationService;
import com.orenjitrade.api.moderation.domain.RateRule;
import com.orenjitrade.api.reports.infra.ReportRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The report threshold (Phase 7 contract): when the open reports against a collector come from at
 * least {@code limit} distinct reporters within the window of the active {@code REPORT_THRESHOLD}
 * rule (3 within 7 days by default), a moderation flag (subject USER, reason REPORT_THRESHOLD) is
 * opened for review and, when the rule's action is BLOCK, the collector's public listings are
 * paused pending review (source REPORT_THRESHOLD). Never a ban or a suspension: people decide
 * those.
 */
@Service
public class ReportThresholdService {

    private static final Logger log = LoggerFactory.getLogger(ReportThresholdService.class);

    private final ReportRepository reports;
    private final ModerationService moderation;
    private final ListingPauseService pauses;
    private final TimeProvider timeProvider;

    public ReportThresholdService(
            ReportRepository reports,
            ModerationService moderation,
            ListingPauseService pauses,
            TimeProvider timeProvider) {
        this.reports = reports;
        this.moderation = moderation;
        this.pauses = pauses;
        this.timeProvider = timeProvider;
    }

    /**
     * Evaluates the threshold for a reported collector (idempotent: one open flag per reason, a
     * pause only when none is in force).
     *
     * @return whether the threshold is reached
     */
    @Transactional
    public boolean evaluate(UUID reportedUserId) {
        Optional<RateRule> rule = moderation.reportThreshold();
        if (rule.isEmpty()) {
            return false;
        }
        Instant since = timeProvider.now().minus(Duration.ofSeconds(rule.get().windowSeconds()));
        int reporters = reports.distinctOpenReporters(reportedUserId, since);
        if (!reached(reporters, rule.get().limit())) {
            return false;
        }
        boolean flagged =
                moderation.flagAccount(
                        reportedUserId, rule.get().id(), FlagReason.REPORT_THRESHOLD);
        if (rule.get().action() == ModerationAction.BLOCK && !pauses.isPaused(reportedUserId)) {
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("openReporters", reporters);
            details.put("windowSeconds", rule.get().windowSeconds());
            pauses.pause(
                    reportedUserId,
                    PauseSource.REPORT_THRESHOLD,
                    "Open reports reached the review threshold",
                    null,
                    ActorType.SYSTEM,
                    null,
                    details);
        }
        if (flagged) {
            log.info("Report threshold reached for {} ({} reporters)", reportedUserId, reporters);
        }
        return true;
    }

    /** Whether {@code distinctReporters} reach a threshold of {@code limit} (pure). */
    public static boolean reached(int distinctReporters, int limit) {
        return distinctReporters >= limit;
    }
}
