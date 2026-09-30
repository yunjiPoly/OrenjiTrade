package com.orenjitrade.api.reports.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.audit.api.AuditLogEntry;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.community.domain.CommunityService.RemovedContent;
import com.orenjitrade.api.delisting.domain.ListingStatus;
import com.orenjitrade.api.delisting.domain.PauseSource;
import com.orenjitrade.api.messaging.domain.ConversationService.ModerationMessage;
import com.orenjitrade.api.messaging.domain.MessageKind;
import com.orenjitrade.api.moderation.domain.ContentModerationState;
import com.orenjitrade.api.moderation.domain.FlagReason;
import com.orenjitrade.api.moderation.domain.ModerationFlagView;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.ratings.domain.RatingModerationState;
import com.orenjitrade.api.ratings.domain.RatingService.RatingView;
import com.orenjitrade.api.reports.domain.AdminReportService.NoteView;
import com.orenjitrade.api.reports.domain.AdminReportService.ReportDetailView;
import com.orenjitrade.api.reports.domain.AdminReportService.ReportSummaryView;
import com.orenjitrade.api.reports.domain.ModerationHistoryService.ModerationHistory;
import com.orenjitrade.api.reports.domain.ReportContext;
import com.orenjitrade.api.reports.domain.ReportReason;
import com.orenjitrade.api.reports.domain.ReportRow;
import com.orenjitrade.api.reports.domain.ReportStatus;
import com.orenjitrade.api.reports.domain.ResolutionAction;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Response documents of the collector report endpoints. */
public final class ReportResponses {

    private ReportResponses() {}

    /** One entry of {@code GET /public/report-reasons}. */
    @Schema(name = "ReportReasonOption")
    public record ReasonResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) ReportReason code,
            @Schema(requiredMode = RequiredMode.REQUIRED) String label,
            @Schema(requiredMode = RequiredMode.REQUIRED) String description) {

        static ReasonResponse from(ReportReason reason) {
            return new ReasonResponse(reason, reason.label(), reason.description());
        }
    }

    /**
     * The confirmation of {@code POST /reports/collectors} and the entries of {@code /me/reports}.
     */
    @Schema(name = "ReportConfirmation", description = "A filed report as its reporter sees it")
    public record ReportConfirmationResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) ReportStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) ReportReason reason,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID reportedUserId) {

        static ReportConfirmationResponse from(ReportRow row) {
            return new ReportConfirmationResponse(
                    row.id(), row.status(), row.createdAt(), row.reason(), row.reportedUserId());
        }
    }

    /** {@code GET /me/reports}: the reporter's own reports with the reported collector. */
    @Schema(name = "MyReport")
    public record MyReportResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) ReportStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED) ReportReason reason,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant resolvedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) MemberResponse reportedUser) {}

    /** A member as shown to moderators and reporters (never a location). */
    @Schema(name = "ReportMember")
    public record MemberResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String handle,
            @Schema(requiredMode = RequiredMode.REQUIRED) String displayName,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String avatarUrl) {

        static MemberResponse of(UUID id, @Nullable MemberCard card) {
            if (card == null) {
                return new MemberResponse(id, "deleted", "Deleted collector", null);
            }
            return new MemberResponse(id, card.handle(), card.displayName(), card.avatarUrl());
        }
    }

    /** Where a report was made. */
    @Schema(name = "ReportContext")
    public record ContextResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) ReportContext.Source source,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID conversationId,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable UUID postId,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID binderId) {

        static ContextResponse from(ReportContext context) {
            return new ContextResponse(
                    context.source(),
                    context.conversationId(),
                    context.postId(),
                    context.binderId());
        }
    }

    /** A report in the moderator queue. */
    @Schema(name = "ReportSummary")
    public record ReportSummaryResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) ReportStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED) ReportReason reason,
            @Schema(requiredMode = RequiredMode.REQUIRED) ReportContext.Source contextSource,
            @Schema(requiredMode = RequiredMode.REQUIRED) MemberResponse reporter,
            @Schema(requiredMode = RequiredMode.REQUIRED) MemberResponse reportedUser,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable MemberResponse assignee,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant resolvedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable ResolutionAction resolutionAction,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Open reports against the reported collector")
                    int openReportsAgainstUser) {

        static ReportSummaryResponse from(ReportSummaryView view) {
            ReportRow row = view.report();
            return new ReportSummaryResponse(
                    row.id(),
                    row.status(),
                    row.reason(),
                    row.context().source(),
                    MemberResponse.of(row.reporterId(), view.reporter()),
                    MemberResponse.of(row.reportedUserId(), view.reported()),
                    row.assignedTo() == null
                            ? null
                            : MemberResponse.of(row.assignedTo(), view.assignee()),
                    row.createdAt(),
                    row.resolvedAt(),
                    row.resolutionAction(),
                    view.openReportsAgainstUser());
        }
    }

    /** A moderator note. */
    @Schema(name = "ModeratorNote")
    public record NoteResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable MemberResponse author,
            @Schema(requiredMode = RequiredMode.REQUIRED) String body,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt) {

        static NoteResponse from(NoteView view) {
            return new NoteResponse(
                    view.note().id(),
                    view.note().authorId() == null
                            ? null
                            : MemberResponse.of(view.note().authorId(), view.author()),
                    view.note().body(),
                    view.note().createdAt());
        }
    }

    /** The reported collector as moderators see them. */
    @Schema(name = "ReportedUserSummary")
    public record ReportedUserResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String handle,
            @Schema(requiredMode = RequiredMode.REQUIRED) String displayName,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String avatarUrl,
            @Schema(requiredMode = RequiredMode.REQUIRED) AccountStatus status,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant suspendedUntil,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant bannedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant memberSince) {

        static ReportedUserResponse of(UserAccountSnapshot account, @Nullable MemberCard card) {
            return new ReportedUserResponse(
                    account.id(),
                    account.handle(),
                    card == null ? account.handle() : card.displayName(),
                    card == null ? null : card.avatarUrl(),
                    account.status(),
                    account.suspendedUntil(),
                    account.bannedAt(),
                    account.createdAt());
        }
    }

    /** A report against the collector (history). */
    @Schema(name = "HistoryReport")
    public record HistoryReportResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) ReportReason reason,
            @Schema(requiredMode = RequiredMode.REQUIRED) ReportStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable ResolutionAction resolutionAction) {

        static HistoryReportResponse from(ReportRow row) {
            return new HistoryReportResponse(
                    row.id(), row.reason(), row.status(), row.createdAt(), row.resolutionAction());
        }
    }

    /** A rating the collector received (history). */
    @Schema(name = "HistoryRating")
    public record HistoryRatingResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String raterHandle,
            @Schema(requiredMode = RequiredMode.REQUIRED) int overall,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String comment,
            @Schema(requiredMode = RequiredMode.REQUIRED) RatingModerationState moderationState,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt) {

        static HistoryRatingResponse from(RatingView view) {
            return new HistoryRatingResponse(
                    view.row().id(),
                    view.rater() == null ? "deleted" : view.rater().handle(),
                    view.row().scores().overall(),
                    view.row().comment(),
                    view.row().moderationState(),
                    view.row().createdAt());
        }
    }

    /** A post or reply removed by moderators (history). */
    @Schema(name = "HistoryRemovedContent")
    public record RemovedContentResponse(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            allowableValues = {"POST", "REPLY"})
                    String kind,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String channelSlug,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant removedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String reason) {

        static RemovedContentResponse from(RemovedContent content) {
            return new RemovedContentResponse(
                    content.kind(),
                    content.id(),
                    content.channelSlug(),
                    content.removedAt(),
                    content.reason());
        }
    }

    /** The current pause of the collector's listings (history). */
    @Schema(name = "HistoryListingStatus")
    public record ListingStatusResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean paused,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PauseSource source,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant pausedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) int strikes) {

        static ListingStatusResponse from(ListingStatus status) {
            return new ListingStatusResponse(
                    status.paused(), status.source(), status.pausedAt(), status.strikes());
        }
    }

    /** An open moderation flag on the account (history). */
    @Schema(name = "HistoryFlag")
    public record FlagResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) FlagReason reason,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt) {

        static FlagResponse from(ModerationFlagView flag) {
            return new FlagResponse(flag.id(), flag.reason(), flag.createdAt());
        }
    }

    /** A collector's moderation history. */
    @Schema(name = "ModerationHistory")
    public record HistoryResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID userId,
            @Schema(requiredMode = RequiredMode.REQUIRED) int openReports,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<HistoryReportResponse> recentReports,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<HistoryRatingResponse> recentRatings,
            @Schema(requiredMode = RequiredMode.REQUIRED)
                    List<RemovedContentResponse> recentPostsRemoved,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<AuditLogEntry> suspensions,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<AuditLogEntry> listingsPaused,
            @Schema(requiredMode = RequiredMode.REQUIRED) ListingStatusResponse listingStatus,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<FlagResponse> openFlags) {

        static HistoryResponse from(ModerationHistory history) {
            return new HistoryResponse(
                    history.userId(),
                    history.openReports(),
                    history.recentReports().stream().map(HistoryReportResponse::from).toList(),
                    history.recentRatings().stream().map(HistoryRatingResponse::from).toList(),
                    history.recentPostsRemoved().stream()
                            .map(RemovedContentResponse::from)
                            .toList(),
                    history.suspensions(),
                    history.listingsPaused(),
                    ListingStatusResponse.from(history.listingStatus()),
                    history.openFlags().stream().map(FlagResponse::from).toList());
        }
    }

    /** A private message of the reported conversation (moderators acting on the report only). */
    @Schema(name = "ReportedConversationMessage")
    public record MessageResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID senderId,
            @Schema(requiredMode = RequiredMode.REQUIRED) MessageKind kind,
            @Schema(requiredMode = RequiredMode.REQUIRED) String body,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) ContentModerationState moderationState) {

        static MessageResponse from(ModerationMessage message) {
            return new MessageResponse(
                    message.id(),
                    message.senderId(),
                    message.kind(),
                    message.body(),
                    message.createdAt(),
                    message.moderationState());
        }
    }

    /** The conversation named by a report's context. */
    @Schema(name = "ReportedConversation")
    public record ConversationResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Newest first (at most 50)")
                    List<MessageResponse> messages) {}

    /** {@code GET /admin/reports/{id}}. */
    @Schema(name = "ReportDetail")
    public record ReportDetailResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) ReportStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED) ReportReason reason,
            @Schema(nullable = true, description = "The reporter's own words")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String details,
            @Schema(requiredMode = RequiredMode.REQUIRED) ContextResponse context,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) MemberResponse reporter,
            @Schema(requiredMode = RequiredMode.REQUIRED) ReportedUserResponse reportedUser,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable MemberResponse assignee,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant resolvedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable ResolutionAction resolutionAction,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String resolutionNote,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<NoteResponse> moderatorNotes,
            @Schema(requiredMode = RequiredMode.REQUIRED) HistoryResponse history,
            @Schema(
                            nullable = true,
                            description =
                                    "Only when the report names a conversation between the two"
                                            + " (then that conversation only)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable ConversationResponse conversation) {

        static ReportDetailResponse from(ReportDetailView view) {
            ReportRow row = view.report();
            ConversationResponse conversation = null;
            if (view.conversationId() != null && view.messages() != null) {
                conversation =
                        new ConversationResponse(
                                view.conversationId(),
                                view.messages().stream().map(MessageResponse::from).toList());
            }
            return new ReportDetailResponse(
                    row.id(),
                    row.status(),
                    row.reason(),
                    row.details(),
                    ContextResponse.from(row.context()),
                    row.createdAt(),
                    MemberResponse.of(row.reporterId(), view.reporter()),
                    ReportedUserResponse.of(view.reportedAccount(), view.reportedCard()),
                    row.assignedTo() == null
                            ? null
                            : MemberResponse.of(row.assignedTo(), view.assignee()),
                    row.resolvedAt(),
                    row.resolutionAction(),
                    row.resolutionNote(),
                    view.notes().stream().map(NoteResponse::from).toList(),
                    HistoryResponse.from(view.history()),
                    conversation);
        }
    }
}
