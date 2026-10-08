package com.orenjitrade.api.ratings.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.moderation.domain.ModerationScope;
import com.orenjitrade.api.moderation.domain.TextModerationService;
import com.orenjitrade.api.notifications.domain.NotificationRequest;
import com.orenjitrade.api.notifications.domain.NotificationService;
import com.orenjitrade.api.notifications.domain.NotificationType;
import com.orenjitrade.api.profiles.domain.CollectorProfileService;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.profiles.domain.MemberDirectory;
import com.orenjitrade.api.ratings.events.RatingSubmitted;
import com.orenjitrade.api.ratings.infra.RatingRepository;
import com.orenjitrade.api.ratings.infra.RatingRepository.SummaryRow;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ratings between collectors (Phase 7 contract "Ratings and references").
 *
 * <ul>
 *   <li>Eligibility: an {@link InteractionService interaction} with the other collector that the
 *       caller has not rated yet; {@code 403 RATING_NOT_ELIGIBLE} without one, {@code 409
 *       ALREADY_RATED} for a second rating of the same interaction.
 *   <li>A rating is editable by its author for {@link RatingRules#EDIT_WINDOW} ({@code 409
 *       RATING_EDIT_WINDOW_CLOSED} afterwards); comments go through the PROFILE banned-term rules.
 *   <li>{@code rating_summary} is refreshed on every write, hide and unhide (OK ratings only) and
 *       feeds profiles, search results and their ranking ({@code RatingSummaryProvider}).
 *   <li>The rated collector gets a RATING_RECEIVED notification; moderators hide and unhide ratings
 *       (audited {@code rating.hide} / {@code rating.unhide}).
 * </ul>
 */
@Service
public class RatingService {

    public static final String ACTION_HIDE = "rating.hide";
    public static final String ACTION_UNHIDE = "rating.unhide";
    public static final String TARGET_RATING = "RATING";
    public static final int DEFAULT_LIMIT = 20;
    public static final int MAX_LIMIT = 50;
    static final String NOT_FOUND = "Rating not found";

    private final InteractionService interactions;
    private final RatingRepository ratings;
    private final UserAccountService accounts;
    private final MemberDirectory members;
    private final CollectorProfileService profiles;
    private final TextModerationService textModeration;
    private final NotificationService notifications;
    private final AuditService auditService;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;

    public RatingService(
            InteractionService interactions,
            RatingRepository ratings,
            UserAccountService accounts,
            MemberDirectory members,
            CollectorProfileService profiles,
            TextModerationService textModeration,
            NotificationService notifications,
            AuditService auditService,
            ApplicationEventPublisher events,
            TimeProvider timeProvider) {
        this.interactions = interactions;
        this.ratings = ratings;
        this.accounts = accounts;
        this.members = members;
        this.profiles = profiles;
        this.textModeration = textModeration;
        this.notifications = notifications;
        this.auditService = auditService;
        this.events = events;
        this.timeProvider = timeProvider;
    }

    // ---------------------------------------------------------------------------------------
    // Eligibility
    // ---------------------------------------------------------------------------------------

    /**
     * {@code GET /ratings/eligibility?userId=}: the caller's interactions with the collector and
     * whether each was already rated; eligible when at least one is not. {@code 400} for oneself.
     */
    @Transactional(readOnly = true)
    public Eligibility eligibility(UUID me, UUID otherId) {
        if (me.equals(otherId)) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("userId", "You cannot rate yourself")));
        }
        List<InteractionView> found = interactions.between(me, otherId);
        Set<UUID> rated =
                ratings.ratedInteractions(me, found.stream().map(InteractionView::id).toList());
        List<EligibleInteraction> result = new ArrayList<>();
        boolean eligible = false;
        for (InteractionView interaction : found) {
            boolean alreadyRated = rated.contains(interaction.id());
            eligible |= !alreadyRated;
            result.add(
                    new EligibleInteraction(
                            interaction.id(),
                            interaction.kind(),
                            interaction.occurredAt(),
                            alreadyRated));
        }
        return new Eligibility(eligible && isRateable(otherId), result);
    }

    // ---------------------------------------------------------------------------------------
    // Writing
    // ---------------------------------------------------------------------------------------

    /** {@code POST /ratings} (see the class comment). */
    @Transactional
    public RatingView submit(
            UUID me, UUID interactionId, RatingScores scores, @Nullable String rawComment) {
        @Nullable String comment = validated(scores, rawComment);
        InteractionView interaction =
                interactions
                        .find(interactionId)
                        .filter(found -> found.involves(me))
                        .orElseThrow(
                                () ->
                                        new ApiException(
                                                ErrorCode.RATING_NOT_ELIGIBLE,
                                                "You can rate a collector after a completed trade,"
                                                        + " an accepted offer or a real"
                                                        + " conversation with them"));
        UUID rateeId = interaction.otherThan(me);
        if (!isRateable(rateeId)) {
            throw new ApiException(
                    ErrorCode.RATING_NOT_ELIGIBLE, "This collector can no longer be rated");
        }
        Optional<RatingRow> existing = ratings.findByInteractionAndRater(interactionId, me);
        if (existing.isPresent()) {
            throw alreadyRated(existing.get().id());
        }
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        UUID id = UUID.randomUUID();
        if (!ratings.insertIfAbsent(id, interactionId, me, rateeId, scores, comment, now)) {
            throw alreadyRated(
                    ratings.findByInteractionAndRater(interactionId, me)
                            .map(RatingRow::id)
                            .orElse(id));
        }
        ratings.refreshSummary(rateeId, now);
        RatingRow row = ratings.find(id).orElseThrow();
        notifyRatee(row);
        events.publishEvent(
                new RatingSubmitted(
                        id,
                        me,
                        rateeId,
                        interaction.kind().name(),
                        scores.overall(),
                        comment != null,
                        false,
                        now));
        return view(row, members.cards(List.of(me)));
    }

    /** {@code PUT /ratings/{id}}: the author edits within the window ({@code 404} for others). */
    @Transactional
    public RatingView update(
            UUID me, UUID ratingId, RatingScores scores, @Nullable String rawComment) {
        RatingRow current =
                ratings.findForUpdate(ratingId)
                        .filter(row -> row.raterId().equals(me))
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        if (!RatingRules.isEditable(current.createdAt(), now)) {
            throw new ApiException(
                            ErrorCode.RATING_EDIT_WINDOW_CLOSED,
                            "Ratings can be edited for 14 days after they were written")
                    .withProperty("editableUntil", RatingRules.editableUntil(current.createdAt()));
        }
        @Nullable String comment = validated(scores, rawComment);
        ratings.update(ratingId, scores, comment, now);
        ratings.refreshSummary(current.rateeId(), now);
        events.publishEvent(
                new RatingSubmitted(
                        ratingId,
                        me,
                        current.rateeId(),
                        current.interactionKind().name(),
                        scores.overall(),
                        comment != null,
                        true,
                        now));
        return view(ratings.find(ratingId).orElseThrow(), members.cards(List.of(me)));
    }

    private @Nullable String validated(RatingScores scores, @Nullable String rawComment) {
        List<ProblemFieldError> errors =
                RatingRules.validate(
                        scores.overall(),
                        scores.communication(),
                        scores.conditionAccuracy(),
                        scores.shipping(),
                        scores.meetupReliability(),
                        rawComment);
        @Nullable String comment = RatingRules.cleanComment(rawComment);
        if (comment != null
                && textModeration.evaluate(ModerationScope.PROFILE, comment).isBlocked()) {
            errors.add(new ProblemFieldError("comment", "contains a term that is not allowed"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        return comment;
    }

    private static ApiException alreadyRated(UUID ratingId) {
        return new ApiException(
                        ErrorCode.ALREADY_RATED,
                        "You already rated this interaction; edit your rating instead")
                .withProperty("ratingId", ratingId);
    }

    /** Accounts that can still receive ratings (not deleted or pending deletion). */
    private boolean isRateable(UUID userId) {
        return accounts.findSnapshot(userId)
                .map(UserAccountSnapshot::status)
                .map(
                        status ->
                                status != AccountStatus.DELETED
                                        && status != AccountStatus.DELETION_REQUESTED)
                .orElse(false);
    }

    private void notifyRatee(RatingRow row) {
        Map<UUID, MemberCard> cards = members.cards(List.of(row.raterId(), row.rateeId()));
        @Nullable MemberCard rater = cards.get(row.raterId());
        @Nullable MemberCard ratee = cards.get(row.rateeId());
        String name = rater == null ? "A collector" : rater.displayName();
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        data.put("ratingId", row.id().toString());
        data.put("overall", row.scores().overall());
        if (rater != null) {
            data.put("raterHandle", rater.handle());
        }
        data.put(
                "deepLink",
                ratee == null ? "/settings" : "/collectors/" + ratee.handle() + "?tab=ratings");
        notifications.notify(
                new NotificationRequest(
                        row.rateeId(),
                        NotificationType.RATING_RECEIVED,
                        "New rating from " + name,
                        name + " rated you " + row.scores().overall() + "/5.",
                        data,
                        "rating:" + row.id()));
    }

    // ---------------------------------------------------------------------------------------
    // Reading
    // ---------------------------------------------------------------------------------------

    /**
     * {@code GET /collectors/{handle}/ratings}: visible ratings newest first plus the summary
     * ({@code 404} when the profile is not visible to the viewer).
     */
    @Transactional(readOnly = true)
    public CollectorRatings ratingsOf(
            @Nullable UUID viewerId, String handle, @Nullable String cursor, int limit) {
        UUID targetId = profiles.requireVisibleCollector(viewerId, handle);
        List<RatingRow> rows = ratings.visiblePage(targetId, TimeCursor.decode(cursor), limit + 1);
        boolean more = rows.size() > limit;
        List<RatingRow> slice = more ? rows.subList(0, limit) : rows;
        Map<UUID, MemberCard> raters =
                members.cards(slice.stream().map(RatingRow::raterId).distinct().toList());
        List<RatingView> items = slice.stream().map(row -> view(row, raters)).toList();
        CursorPage<RatingView> page;
        if (more) {
            RatingRow last = slice.get(slice.size() - 1);
            page = CursorPage.of(items, new TimeCursor(last.createdAt(), last.id()).encode());
        } else {
            page = CursorPage.last(items);
        }
        return new CollectorRatings(page, summaryOf(targetId));
    }

    /** The summary of a collector's visible ratings. */
    @Transactional(readOnly = true)
    public RatingSummaryView summaryOf(UUID userId) {
        return ratings.summary(userId)
                .map(RatingService::summaryView)
                .orElse(RatingSummaryView.NONE);
    }

    /** Summaries of several collectors (unknown ones absent). */
    @Transactional(readOnly = true)
    public Map<UUID, RatingSummaryView> summariesOf(Collection<UUID> userIds) {
        Map<UUID, RatingSummaryView> result = new LinkedHashMap<>();
        ratings.summaries(userIds).forEach((id, row) -> result.put(id, summaryView(row)));
        return result;
    }

    /** The latest ratings a collector received, any state (moderator history). */
    @Transactional(readOnly = true)
    public List<RatingView> recentReceived(UUID userId, int limit) {
        List<RatingRow> rows = ratings.recentReceived(userId, limit);
        Map<UUID, MemberCard> raters =
                members.cards(rows.stream().map(RatingRow::raterId).distinct().toList());
        return rows.stream().map(row -> view(row, raters)).toList();
    }

    // ---------------------------------------------------------------------------------------
    // Moderation (MODERATOR+)
    // ---------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public PageResponse<RatingView> adminList(
            @Nullable UUID rateeId,
            @Nullable UUID raterId,
            @Nullable RatingModerationState state,
            int page,
            int size) {
        RatingRepository.Page result = ratings.adminPage(rateeId, raterId, state, page, size);
        Set<UUID> ids = new LinkedHashSet<>();
        result.rows().forEach(row -> ids.add(row.raterId()));
        Map<UUID, MemberCard> raters = members.cards(ids);
        return PageResponse.of(
                result.rows().stream().map(row -> view(row, raters)).toList(),
                page,
                size,
                result.total());
    }

    /** {@code POST /admin/ratings/{id}/hide}: {@code 409} when already hidden. Audited. */
    @Transactional
    public RatingView hide(AuthenticatedUser moderator, UUID ratingId, String reason) {
        RatingRow row =
                ratings.findForUpdate(ratingId).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        if (row.moderationState() == RatingModerationState.HIDDEN) {
            throw ApiException.conflict("This rating is already hidden");
        }
        Instant now = timeProvider.now();
        String text = reason.strip();
        ratings.setModeration(
                ratingId, RatingModerationState.HIDDEN, text, moderator.userId(), now);
        ratings.refreshSummary(row.rateeId(), now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("reason", text);
        details.put("rateeId", row.rateeId().toString());
        details.put("raterId", row.raterId().toString());
        auditService.record(
                ActorType.ADMIN,
                moderator.userId(),
                ACTION_HIDE,
                TARGET_RATING,
                ratingId.toString(),
                details);
        RatingRow updated = ratings.find(ratingId).orElseThrow();
        return view(updated, members.cards(List.of(updated.raterId())));
    }

    /** {@code POST /admin/ratings/{id}/unhide}: {@code 409} when not hidden. Audited. */
    @Transactional
    public RatingView unhide(AuthenticatedUser moderator, UUID ratingId) {
        RatingRow row =
                ratings.findForUpdate(ratingId).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        if (row.moderationState() != RatingModerationState.HIDDEN) {
            throw ApiException.conflict("This rating is not hidden");
        }
        Instant now = timeProvider.now();
        ratings.setModeration(ratingId, RatingModerationState.OK, null, null, now);
        ratings.refreshSummary(row.rateeId(), now);
        auditService.record(
                ActorType.ADMIN,
                moderator.userId(),
                ACTION_UNHIDE,
                TARGET_RATING,
                ratingId.toString(),
                Map.of("rateeId", row.rateeId().toString()));
        RatingRow updated = ratings.find(ratingId).orElseThrow();
        return view(updated, members.cards(List.of(updated.raterId())));
    }

    // ---------------------------------------------------------------------------------------
    // Account data
    // ---------------------------------------------------------------------------------------

    /** Export section: ratings written and received (the owner's own view). */
    @Transactional(readOnly = true)
    public List<Map<String, @Nullable Object>> export(UUID userId) {
        List<Map<String, @Nullable Object>> result = new ArrayList<>();
        for (RatingRow row : ratings.allOf(userId)) {
            Map<String, @Nullable Object> entry = new LinkedHashMap<>();
            entry.put("id", row.id());
            entry.put("direction", row.raterId().equals(userId) ? "GIVEN" : "RECEIVED");
            entry.put("interactionKind", row.interactionKind().name());
            entry.put("overall", row.scores().overall());
            entry.put("communication", row.scores().communication());
            entry.put("conditionAccuracy", row.scores().conditionAccuracy());
            entry.put("shipping", row.scores().shipping());
            entry.put("meetupReliability", row.scores().meetupReliability());
            entry.put("comment", row.comment());
            entry.put("createdAt", row.createdAt());
            entry.put("updatedAt", row.updatedAt());
            entry.put("moderationState", row.moderationState().name());
            result.add(entry);
        }
        return result;
    }

    /** Deletion: removes the ratings the account wrote (summaries of the rated refreshed). */
    @Transactional
    public void purge(UUID userId) {
        Instant now = timeProvider.now();
        for (UUID ratee : ratings.deleteAuthoredBy(userId)) {
            ratings.refreshSummary(ratee, now);
        }
        ratings.deleteSummary(userId);
    }

    // ---------------------------------------------------------------------------------------
    // Mapping
    // ---------------------------------------------------------------------------------------

    static RatingView view(RatingRow row, Map<UUID, MemberCard> raters) {
        @Nullable MemberCard rater = raters.get(row.raterId());
        return new RatingView(row, rater, RatingRules.editableUntil(row.createdAt()));
    }

    static RatingSummaryView summaryView(SummaryRow row) {
        return new RatingSummaryView(
                RatingRules.oneDecimal(row.average()),
                row.count(),
                RatingRules.oneDecimal(row.communication()),
                RatingRules.oneDecimal(row.conditionAccuracy()),
                RatingRules.oneDecimal(row.shipping()),
                RatingRules.oneDecimal(row.meetupReliability()));
    }

    /**
     * A rating with its author's card.
     *
     * @param row the stored rating
     * @param rater the author's card ({@code null} when unknown)
     * @param editableUntil end of the edit window
     */
    public record RatingView(RatingRow row, @Nullable MemberCard rater, Instant editableUntil) {}

    /**
     * Averages of a collector's visible ratings (one decimal).
     *
     * @param average overall average, {@code null} without ratings
     * @param count number of visible ratings
     * @param communication average communication score
     * @param conditionAccuracy average condition accuracy score
     * @param shipping average shipping score
     * @param meetupReliability average meetup reliability score
     */
    public record RatingSummaryView(
            @Nullable Double average,
            int count,
            @Nullable Double communication,
            @Nullable Double conditionAccuracy,
            @Nullable Double shipping,
            @Nullable Double meetupReliability) {

        public static final RatingSummaryView NONE =
                new RatingSummaryView(null, 0, null, null, null, null);
    }

    /** A page of a collector's ratings with their summary. */
    public record CollectorRatings(CursorPage<RatingView> page, RatingSummaryView summary) {}

    /** One interaction of the eligibility answer. */
    public record EligibleInteraction(
            UUID id, InteractionKind kind, Instant occurredAt, boolean alreadyRated) {}

    /** The eligibility answer. */
    public record Eligibility(boolean eligible, List<EligibleInteraction> interactions) {}
}
