package com.orenjitrade.api.reports.domain;

import com.orenjitrade.api.audit.api.AuditLogEntry;
import com.orenjitrade.api.audit.domain.AuditQueryService;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.community.domain.CommunityService;
import com.orenjitrade.api.community.domain.CommunityService.RemovedContent;
import com.orenjitrade.api.delisting.domain.ListingPauseService;
import com.orenjitrade.api.delisting.domain.ListingStatus;
import com.orenjitrade.api.moderation.domain.ModerationFlagView;
import com.orenjitrade.api.moderation.domain.ModerationService;
import com.orenjitrade.api.ratings.domain.RatingService;
import com.orenjitrade.api.ratings.domain.RatingService.RatingView;
import com.orenjitrade.api.reports.infra.ReportRepository;
import com.orenjitrade.api.users.domain.UserAccountService;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A collector's moderation history for moderators (Phase 7 report detail and {@code GET
 * /admin/users/{id}/history}): recent reports against them, ratings they received, their posts and
 * replies removed by moderators, suspensions and listing pauses (from the audit log), the current
 * listing pause and open account flags. Never private message bodies.
 */
@Service
public class ModerationHistoryService {

    public static final int RECENT = 10;
    static final int AUDIT_SCAN = 200;
    static final Set<String> SUSPENSION_ACTIONS =
            Set.of("user.suspend", "user.unsuspend", "user.ban", "user.suspension.expired");
    static final Set<String> PAUSE_ACTIONS =
            Set.of(ListingPauseService.ACTION_PAUSE, ListingPauseService.ACTION_RESUME);

    private final ReportRepository reports;
    private final RatingService ratings;
    private final CommunityService community;
    private final AuditQueryService audit;
    private final ListingPauseService pauses;
    private final ModerationService moderation;
    private final UserAccountService accounts;

    public ModerationHistoryService(
            ReportRepository reports,
            RatingService ratings,
            CommunityService community,
            AuditQueryService audit,
            ListingPauseService pauses,
            ModerationService moderation,
            UserAccountService accounts) {
        this.reports = reports;
        this.ratings = ratings;
        this.community = community;
        this.audit = audit;
        this.pauses = pauses;
        this.moderation = moderation;
        this.accounts = accounts;
    }

    /** The history of an account ({@code 404} for unknown ids). */
    @Transactional(readOnly = true)
    public ModerationHistory historyOf(UUID userId) {
        if (accounts.findSnapshot(userId).isEmpty()) {
            throw ApiException.notFound("Account not found");
        }
        List<AuditLogEntry> entries =
                audit.recentForTarget(AuditService.TARGET_USER, userId.toString(), AUDIT_SCAN);
        return new ModerationHistory(
                userId,
                reports.openAgainst(userId),
                reports.against(userId, RECENT),
                ratings.recentReceived(userId, RECENT),
                community.removedContentOf(userId, RECENT),
                entries.stream()
                        .filter(entry -> SUSPENSION_ACTIONS.contains(entry.action()))
                        .limit(RECENT)
                        .toList(),
                entries.stream()
                        .filter(entry -> PAUSE_ACTIONS.contains(entry.action()))
                        .limit(RECENT)
                        .toList(),
                pauses.status(userId),
                moderation.openAccountFlags(userId));
    }

    /**
     * A collector's moderation history.
     *
     * @param userId the collector
     * @param openReports reports against them still OPEN or UNDER_REVIEW
     * @param recentReports latest reports against them
     * @param recentRatings latest ratings they received (any state)
     * @param recentPostsRemoved latest posts and replies removed by moderators
     * @param suspensions latest suspension, ban and unsuspension audit entries
     * @param listingsPaused latest listing pause and resume audit entries
     * @param listingStatus current pause and strikes
     * @param openFlags open moderation flags on the account
     */
    public record ModerationHistory(
            UUID userId,
            int openReports,
            List<ReportRow> recentReports,
            List<RatingView> recentRatings,
            List<RemovedContent> recentPostsRemoved,
            List<AuditLogEntry> suspensions,
            List<AuditLogEntry> listingsPaused,
            ListingStatus listingStatus,
            List<ModerationFlagView> openFlags) {}
}
