package com.orenjitrade.api.ratings.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.moderation.domain.ModerationScope;
import com.orenjitrade.api.moderation.domain.TextModerationService;
import com.orenjitrade.api.profiles.domain.CollectorProfileService;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.profiles.domain.MemberDirectory;
import com.orenjitrade.api.ratings.infra.ReferenceRepository;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * References (Phase 7 contract): a short public testimonial, one per author and subject, written
 * after at least one interaction ({@code 403 RATING_NOT_ELIGIBLE} otherwise, {@code 409} for a
 * second one). Bodies go through the PROFILE banned-term rules; moderators hide and unhide them
 * (audited {@code reference.hide} / {@code reference.unhide}).
 */
@Service
public class ReferenceService {

    public static final String ACTION_HIDE = "reference.hide";
    public static final String ACTION_UNHIDE = "reference.unhide";
    public static final String TARGET_REFERENCE = "REFERENCE";
    static final String NOT_FOUND = "Reference not found";

    private final ReferenceRepository references;
    private final InteractionService interactions;
    private final UserAccountService accounts;
    private final MemberDirectory members;
    private final CollectorProfileService profiles;
    private final TextModerationService textModeration;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public ReferenceService(
            ReferenceRepository references,
            InteractionService interactions,
            UserAccountService accounts,
            MemberDirectory members,
            CollectorProfileService profiles,
            TextModerationService textModeration,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.references = references;
        this.interactions = interactions;
        this.accounts = accounts;
        this.members = members;
        this.profiles = profiles;
        this.textModeration = textModeration;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    /** {@code POST /references}. */
    @Transactional
    public ReferenceView create(UUID me, UUID subjectId, String rawBody) {
        List<ProblemFieldError> errors = new ArrayList<>();
        if (me.equals(subjectId)) {
            errors.add(
                    new ProblemFieldError(
                            "subjectId", "You cannot write a reference for yourself"));
        }
        String body = rawBody == null ? "" : rawBody.strip();
        if (body.isEmpty() || body.length() > RatingRules.REFERENCE_MAX) {
            errors.add(new ProblemFieldError("body", "must be 1 to 400 characters"));
        } else if (textModeration.evaluate(ModerationScope.PROFILE, body).isBlocked()) {
            errors.add(new ProblemFieldError("body", "contains a term that is not allowed"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        boolean active =
                accounts.findSnapshot(subjectId)
                        .map(UserAccountSnapshot::status)
                        .map(
                                status ->
                                        status != AccountStatus.DELETED
                                                && status != AccountStatus.DELETION_REQUESTED)
                        .orElse(false);
        if (!active || interactions.between(me, subjectId).isEmpty()) {
            throw new ApiException(
                    ErrorCode.RATING_NOT_ELIGIBLE,
                    "You can write a reference after a completed trade, an accepted offer or a"
                            + " real conversation with this collector");
        }
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        UUID id = UUID.randomUUID();
        if (!references.insertIfAbsent(id, me, subjectId, body, now)) {
            throw ApiException.conflict("You already wrote a reference for this collector");
        }
        ReferenceRow row = references.find(id).orElseThrow();
        return view(row, members.cards(List.of(me)));
    }

    /** {@code GET /collectors/{handle}/references}: visible references, newest first. */
    @Transactional(readOnly = true)
    public CursorPage<ReferenceView> referencesOf(
            @Nullable UUID viewerId, String handle, @Nullable String cursor, int limit) {
        UUID targetId = profiles.requireVisibleCollector(viewerId, handle);
        List<ReferenceRow> rows =
                references.visiblePage(targetId, TimeCursor.decode(cursor), limit + 1);
        boolean more = rows.size() > limit;
        List<ReferenceRow> slice = more ? rows.subList(0, limit) : rows;
        Map<UUID, MemberCard> authors =
                members.cards(slice.stream().map(ReferenceRow::authorId).distinct().toList());
        List<ReferenceView> items = slice.stream().map(row -> view(row, authors)).toList();
        if (!more) {
            return CursorPage.last(items);
        }
        ReferenceRow last = slice.get(slice.size() - 1);
        return CursorPage.of(items, new TimeCursor(last.createdAt(), last.id()).encode());
    }

    /** {@code POST /admin/references/{id}/hide} ({@code 409} when already hidden, audited). */
    @Transactional
    public ReferenceView hide(AuthenticatedUser moderator, UUID id, String reason) {
        ReferenceRow row = references.find(id).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        if (row.moderationState() == RatingModerationState.HIDDEN) {
            throw ApiException.conflict("This reference is already hidden");
        }
        String text = reason.strip();
        references.setModeration(
                id, RatingModerationState.HIDDEN, text, moderator.userId(), timeProvider.now());
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("reason", text);
        details.put("subjectId", row.subjectId().toString());
        details.put("authorId", row.authorId().toString());
        auditService.record(
                ActorType.ADMIN,
                moderator.userId(),
                ACTION_HIDE,
                TARGET_REFERENCE,
                id.toString(),
                details);
        ReferenceRow updated = references.find(id).orElseThrow();
        return view(updated, members.cards(List.of(updated.authorId())));
    }

    /** {@code POST /admin/references/{id}/unhide} ({@code 409} when not hidden, audited). */
    @Transactional
    public ReferenceView unhide(AuthenticatedUser moderator, UUID id) {
        ReferenceRow row = references.find(id).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        if (row.moderationState() != RatingModerationState.HIDDEN) {
            throw ApiException.conflict("This reference is not hidden");
        }
        references.setModeration(id, RatingModerationState.OK, null, null, timeProvider.now());
        auditService.record(
                ActorType.ADMIN,
                moderator.userId(),
                ACTION_UNHIDE,
                TARGET_REFERENCE,
                id.toString(),
                Map.of("subjectId", row.subjectId().toString()));
        ReferenceRow updated = references.find(id).orElseThrow();
        return view(updated, members.cards(List.of(updated.authorId())));
    }

    /** Export section: references written and received. */
    @Transactional(readOnly = true)
    public List<Map<String, @Nullable Object>> export(UUID userId) {
        List<Map<String, @Nullable Object>> result = new ArrayList<>();
        for (ReferenceRow row : references.allOf(userId)) {
            Map<String, @Nullable Object> entry = new LinkedHashMap<>();
            entry.put("id", row.id());
            entry.put("direction", row.authorId().equals(userId) ? "WRITTEN" : "RECEIVED");
            entry.put("body", row.body());
            entry.put("createdAt", row.createdAt());
            entry.put("moderationState", row.moderationState().name());
            result.add(entry);
        }
        return result;
    }

    /** Deletion: references written by or about the account. */
    @Transactional
    public void purge(UUID userId) {
        references.deleteOf(userId);
    }

    static ReferenceView view(ReferenceRow row, Map<UUID, MemberCard> authors) {
        return new ReferenceView(row, authors.get(row.authorId()));
    }

    /**
     * A reference with its author's card.
     *
     * @param row the stored reference
     * @param author the author's card ({@code null} when unknown)
     */
    public record ReferenceView(ReferenceRow row, @Nullable MemberCard author) {}
}
