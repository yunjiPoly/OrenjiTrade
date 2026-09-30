package com.orenjitrade.api.messaging.domain;

import com.orenjitrade.api.binders.domain.BinderLink;
import com.orenjitrade.api.binders.domain.PublicBinderService;
import com.orenjitrade.api.cards.domain.CardLink;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.messaging.domain.RealtimeNotices.ReadReceipt;
import com.orenjitrade.api.messaging.events.MessageRead;
import com.orenjitrade.api.messaging.events.MessageSent;
import com.orenjitrade.api.messaging.infra.ConversationRepository;
import com.orenjitrade.api.messaging.infra.ConversationRepository.ParticipantRow;
import com.orenjitrade.api.messaging.infra.ConversationRepository.SummaryRow;
import com.orenjitrade.api.messaging.infra.ImageUploadRepository.UploadRow;
import com.orenjitrade.api.messaging.infra.MessageRepository;
import com.orenjitrade.api.messaging.infra.MessageRepository.AttachmentRow;
import com.orenjitrade.api.messaging.infra.MessageRepository.MessageRow;
import com.orenjitrade.api.messaging.infra.PresenceStore;
import com.orenjitrade.api.moderation.domain.ContentModerationState;
import com.orenjitrade.api.moderation.domain.FlagSubjectType;
import com.orenjitrade.api.moderation.domain.ModerationDecision;
import com.orenjitrade.api.moderation.domain.ModerationScope;
import com.orenjitrade.api.moderation.domain.ModerationService;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.OnlineStatus;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.profiles.domain.MemberDirectory;
import com.orenjitrade.api.profiles.domain.MessagingPermission;
import com.orenjitrade.api.profiles.domain.PrivacyPolicyService;
import com.orenjitrade.api.profiles.domain.ProfileService;
import com.orenjitrade.api.profiles.domain.ViewerContext;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The messaging module's service interface for private conversations (Phase 5 contract "Private
 * messaging"): list, start (idempotent per pair), read a thread (cursor, newest first), send (text,
 * card and binder links, photos; moderation and the 30/min rate rule), read markers and the
 * per-participant mute/archive switches.
 *
 * <p>Authorization: only the two participants see a conversation (404 for anybody else); a block in
 * either direction hides it from both (404) and forbids new conversations and messages ({@code 403
 * MESSAGING_BLOCKED}); starting a conversation follows the recipient's messaging permission through
 * {@link PrivacyPolicyService#canMessage}. Messages and receipts are pushed to both participants'
 * realtime sessions after commit; {@link MessageSent} and {@link MessageRead} are published inside
 * the transaction for later phases. Message text never reaches logs or events.
 */
@Service
public class ConversationService {

    public static final int BODY_MAX = 4000;
    public static final int CONVERSATIONS_DEFAULT_LIMIT = 20;
    public static final int CONVERSATIONS_MAX_LIMIT = 50;
    public static final int MESSAGES_DEFAULT_LIMIT = 50;
    public static final int MESSAGES_MAX_LIMIT = 100;
    static final String NOT_FOUND = "Conversation not found";

    private static final Logger log = LoggerFactory.getLogger(ConversationService.class);

    private final ConversationRepository conversations;
    private final MessageRepository messages;
    private final BlockService blocks;
    private final MemberDirectory members;
    private final PrivacyPolicyService privacyPolicy;
    private final ProfileService profiles;
    private final PresenceStore presence;
    private final ModerationService moderation;
    private final CatalogService catalog;
    private final PublicBinderService publicBinders;
    private final ImageUploadService uploads;
    private final RealtimePublisher realtime;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public ConversationService(
            ConversationRepository conversations,
            MessageRepository messages,
            BlockService blocks,
            MemberDirectory members,
            PrivacyPolicyService privacyPolicy,
            ProfileService profiles,
            PresenceStore presence,
            ModerationService moderation,
            CatalogService catalog,
            PublicBinderService publicBinders,
            ImageUploadService uploads,
            RealtimePublisher realtime,
            ApplicationEventPublisher events,
            TimeProvider timeProvider,
            JsonMapper jsonMapper) {
        this.conversations = conversations;
        this.messages = messages;
        this.blocks = blocks;
        this.members = members;
        this.privacyPolicy = privacyPolicy;
        this.profiles = profiles;
        this.presence = presence;
        this.moderation = moderation;
        this.catalog = catalog;
        this.publicBinders = publicBinders;
        this.uploads = uploads;
        this.realtime = realtime;
        this.events = events;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
    }

    // ---------------------------------------------------------------------------------------
    // Conversations
    // ---------------------------------------------------------------------------------------

    /** {@code GET /conversations}: most recent activity first; blocked pairs are hidden. */
    @Transactional(readOnly = true)
    public CursorPage<ConversationSummary> list(
            UUID me, boolean archived, @Nullable String cursor, int limit) {
        List<SummaryRow> rows =
                conversations.summaries(me, archived, TimeCursor.decode(cursor), limit + 1);
        boolean hasMore = rows.size() > limit;
        List<SummaryRow> slice = hasMore ? rows.subList(0, limit) : rows;
        Map<UUID, MemberCard> cards =
                members.cards(slice.stream().map(SummaryRow::otherId).distinct().toList());
        List<ConversationSummary> items = new ArrayList<>();
        for (SummaryRow row : slice) {
            MemberCard other = cards.get(row.otherId());
            if (other != null) {
                items.add(summary(me, row, other));
            }
        }
        if (!hasMore) {
            return CursorPage.last(items);
        }
        SummaryRow last = slice.get(slice.size() - 1);
        return CursorPage.of(items, new TimeCursor(last.sortAt(), last.id()).encode());
    }

    /**
     * {@code POST /conversations}: the existing conversation with the recipient or a new one (never
     * 409). {@code 400} for oneself, {@code 404} for unknown, suspended or deleted recipients,
     * {@code 403 MESSAGING_BLOCKED} for a block in either direction or when the recipient's
     * messaging permission refuses the caller (new conversations only).
     */
    @Transactional
    public Started start(UUID me, UUID recipientId) {
        if (me.equals(recipientId)) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("recipientId", "You cannot message yourself")));
        }
        Instant now = timeProvider.now();
        MemberCard recipient =
                members.card(recipientId)
                        .filter(card -> card.activeAt(now))
                        .orElseThrow(() -> ApiException.notFound("Collector not found"));
        if (blocks.isBlockedEitherWay(me, recipientId)) {
            throw messagingBlocked("You cannot message this collector");
        }
        Optional<UUID> existing = conversations.findByPair(me, recipientId);
        if (existing.isPresent()) {
            return new Started(requireSummary(existing.get(), me), false);
        }
        ViewerContext viewer = new ViewerContext(me, profiles.isComplete(me), false);
        if (!privacyPolicy.canMessage(viewer, recipientId, recipient.privacy())) {
            throw messagingBlocked(
                    recipient.privacy().messagingPermission()
                                    == MessagingPermission.MEMBERS_WITH_PROFILE
                            ? "Complete your profile to message this collector"
                            : "This collector does not accept new conversations");
        }
        ConversationRepository.Created created =
                conversations.createDirect(UUID.randomUUID(), me, recipientId, now);
        if (created.created()) {
            log.info("Conversation {} started by {}", created.conversationId(), me);
        }
        return new Started(requireSummary(created.conversationId(), me), created.created());
    }

    /** {@code PATCH /conversations/{id}}: the caller's mute/archive switches. */
    @Transactional
    public ConversationSummary update(
            UUID me, UUID conversationId, @Nullable Boolean muted, @Nullable Boolean archived) {
        requireVisible(me, conversationId);
        conversations.updateSwitches(conversationId, me, muted, archived);
        return requireSummary(conversationId, me);
    }

    // ---------------------------------------------------------------------------------------
    // Messages
    // ---------------------------------------------------------------------------------------

    /** {@code GET /conversations/{id}/messages}: newest first. */
    @Transactional(readOnly = true)
    public CursorPage<MessageView> messages(
            UUID me, UUID conversationId, @Nullable String cursor, int limit) {
        Visible visible = requireVisible(me, conversationId);
        List<MessageRow> rows = messages.page(conversationId, TimeCursor.decode(cursor), limit + 1);
        boolean hasMore = rows.size() > limit;
        List<MessageRow> slice = hasMore ? rows.subList(0, limit) : rows;
        List<MessageView> items = views(slice, visible);
        if (!hasMore) {
            return CursorPage.last(items);
        }
        MessageRow last = slice.get(slice.size() - 1);
        return CursorPage.of(items, new TimeCursor(last.createdAt(), last.id()).encode());
    }

    /**
     * {@code POST /conversations/{id}/messages}. {@code 404} for non-participants, {@code 403
     * MESSAGING_BLOCKED} when a block exists or the other participant cannot receive messages,
     * {@code 400} for invalid content, {@code 422 MESSAGE_BLOCKED} for content the moderation rules
     * refuse, {@code 429 RATE_LIMITED} above the rate rule (30 per minute by default).
     */
    @Transactional
    public MessageView send(UUID me, UUID conversationId, NewMessage input) {
        Participants participants = requireParticipants(me, conversationId);
        UUID otherId = participants.other().userId();
        if (blocks.isBlockedEitherWay(me, otherId)) {
            throw messagingBlocked("You cannot message this collector");
        }
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        boolean otherActive = members.card(otherId).map(card -> card.activeAt(now)).orElse(false);
        if (!otherActive) {
            throw messagingBlocked("This collector cannot receive messages right now");
        }
        String body = input.body() == null ? "" : input.body().strip();
        validate(input, body);

        ObjectNode payload = jsonMapper.createObjectNode();
        @Nullable String linkName = null;
        @Nullable UploadRow upload = null;
        switch (input.kind()) {
            case CARD_LINK -> {
                UUID printingId = requireNonNull(input.cardPrintingId());
                CardLink card =
                        catalog.cardLink(printingId)
                                .orElseThrow(() -> invalid("cardPrintingId", "Unknown printing"));
                ObjectNode node = payload.putObject("card");
                node.put("printingId", card.id().toString());
                node.put("cardId", card.cardId().toString());
                node.put("name", card.name());
                if (card.printingCode() != null) {
                    node.put("printingCode", card.printingCode());
                }
                linkName = card.name();
            }
            case BINDER_LINK -> {
                UUID binderId = requireNonNull(input.binderId());
                BinderLink binder =
                        publicBinders
                                .binderLink(otherId, binderId)
                                .orElseThrow(
                                        () ->
                                                invalid(
                                                        "binderId",
                                                        "Only public binders can be shared"));
                ObjectNode node = payload.putObject("binder");
                node.put("binderId", binder.id().toString());
                node.put("name", binder.name());
                node.put("ownerHandle", binder.ownerHandle());
                linkName = binder.name();
            }
            case IMAGE -> {
                UUID uploadId = requireNonNull(input.imageUploadId());
                upload =
                        uploads.lockAttachable(me, uploadId)
                                .orElseThrow(
                                        () ->
                                                invalid(
                                                        "imageUploadId",
                                                        "Unknown, used or expired upload"));
            }
            default -> {
                // TEXT: nothing to resolve (OFFER_LINK and SYSTEM were refused by validate()).
            }
        }

        ModerationDecision decision =
                moderation.check(ModerationScope.MESSAGE, body.isEmpty() ? null : body, me);
        if (decision.blocked()) {
            throw new ApiException(
                    ErrorCode.MESSAGE_BLOCKED,
                    "This message cannot be sent because it breaks the community guidelines");
        }
        UUID messageId = UUID.randomUUID();
        if (upload != null) {
            UUID attachmentId = UUID.randomUUID();
            payload.putObject("image").put("attachmentId", attachmentId.toString());
            // The message row must exist before its attachment (FK); inserted right below.
            insertMessage(
                    messageId, conversationId, me, input.kind(), body, payload, now, decision);
            messages.insertAttachment(
                    attachmentId,
                    messageId,
                    upload.storageKey(),
                    uploads.urlOf(upload.storageKey()),
                    upload.width(),
                    upload.height(),
                    upload.bytes(),
                    now);
            uploads.markConsumed(upload.id());
        } else {
            insertMessage(
                    messageId, conversationId, me, input.kind(), body, payload, now, decision);
        }
        conversations.updateLastMessage(
                conversationId,
                messageId,
                now,
                MessagePreviews.of(input.kind(), body, linkName),
                input.kind().name(),
                me);
        conversations.unarchive(conversationId);
        conversations.markRead(conversationId, me, now, messageId);
        if (decision.flagged()) {
            moderation.recordFlags(decision, FlagSubjectType.MESSAGE, messageId, me);
        }
        events.publishEvent(
                new MessageSent(messageId, conversationId, me, otherId, input.kind().name(), now));

        MessageRow stored =
                messages.find(conversationId, messageId)
                        .orElseThrow(() -> new IllegalStateException("Message not stored"));
        Participants after = requireParticipants(me, conversationId);
        MessageView view = views(List.of(stored), new Visible(after.mine(), after.other())).get(0);
        afterCommit(
                () -> {
                    realtime.publish(otherId, RealtimeDestinations.MESSAGES, view);
                    realtime.publish(me, RealtimeDestinations.MESSAGES, view);
                });
        log.debug(
                "Message {} sent in conversation {} kind={}",
                messageId,
                conversationId,
                input.kind());
        return view;
    }

    /**
     * {@code POST /conversations/{id}/read}: moves the caller's read marker to a message of the
     * conversation (never backwards) and pushes a read receipt to both participants.
     */
    @Transactional
    public void markRead(UUID me, UUID conversationId, UUID lastReadMessageId) {
        Visible visible = requireVisible(me, conversationId);
        MessageRow message =
                messages.find(conversationId, lastReadMessageId)
                        .orElseThrow(
                                () ->
                                        invalid(
                                                "lastReadMessageId",
                                                "Not a message of this conversation"));
        if (!conversations.markRead(conversationId, me, message.createdAt(), message.id())) {
            return;
        }
        UUID otherId = visible.other().userId();
        Instant now = timeProvider.now();
        events.publishEvent(new MessageRead(conversationId, me, otherId, message.id(), now));
        ReadReceipt receipt = new ReadReceipt(conversationId, me, message.id(), now);
        afterCommit(
                () -> {
                    realtime.publish(otherId, RealtimeDestinations.RECEIPTS, receipt);
                    realtime.publish(me, RealtimeDestinations.RECEIPTS, receipt);
                });
    }

    // ---------------------------------------------------------------------------------------
    // Realtime support
    // ---------------------------------------------------------------------------------------

    /**
     * The participant who should see a typing notice of {@code me} in {@code conversationId}; empty
     * when the caller is not a participant or a block exists.
     */
    @Transactional(readOnly = true)
    public Optional<UUID> typingRecipient(UUID me, UUID conversationId) {
        Optional<ParticipantRow> mine = conversations.participant(conversationId, me);
        if (mine.isEmpty()) {
            return Optional.empty();
        }
        return conversations.participants(conversationId).stream()
                .map(ParticipantRow::userId)
                .filter(id -> !id.equals(me))
                .filter(id -> !blocks.isBlockedEitherWay(me, id))
                .findFirst();
    }

    /** Conversation partners of an account who are not blocked (presence notices). */
    @Transactional(readOnly = true)
    public List<UUID> partnersOf(UUID me) {
        return conversations.partnersOf(me).stream()
                .filter(id -> !blocks.isBlockedEitherWay(me, id))
                .toList();
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private void insertMessage(
            UUID messageId,
            UUID conversationId,
            UUID me,
            MessageKind kind,
            String body,
            ObjectNode payload,
            Instant now,
            ModerationDecision decision) {
        messages.insert(
                messageId,
                conversationId,
                me,
                kind.name(),
                body,
                jsonMapper.writeValueAsString(payload),
                now,
                (decision.flagged() ? ContentModerationState.FLAGGED : ContentModerationState.OK)
                        .name());
    }

    private static void validate(NewMessage input, String body) {
        List<ProblemFieldError> errors = new ArrayList<>();
        if (body.length() > BODY_MAX) {
            errors.add(
                    new ProblemFieldError("body", "must be at most " + BODY_MAX + " characters"));
        }
        switch (input.kind()) {
            case TEXT -> {
                if (body.isEmpty()) {
                    errors.add(new ProblemFieldError("body", "must not be blank"));
                }
            }
            case CARD_LINK -> {
                if (input.cardPrintingId() == null) {
                    errors.add(
                            new ProblemFieldError(
                                    "cardPrintingId", "is required for CARD_LINK messages"));
                }
            }
            case BINDER_LINK -> {
                if (input.binderId() == null) {
                    errors.add(
                            new ProblemFieldError(
                                    "binderId", "is required for BINDER_LINK messages"));
                }
            }
            case IMAGE -> {
                if (input.imageUploadId() == null) {
                    errors.add(
                            new ProblemFieldError(
                                    "imageUploadId", "is required for IMAGE messages"));
                }
            }
            case OFFER_LINK ->
                    errors.add(
                            new ProblemFieldError(
                                    "kind", "Offer messages become available with offers"));
            case SYSTEM ->
                    errors.add(new ProblemFieldError("kind", "SYSTEM messages cannot be sent"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
    }

    /** Views of stored messages for one participant (links resolved in batches). */
    private List<MessageView> views(List<MessageRow> rows, Visible visible) {
        Set<UUID> printingIds = new LinkedHashSet<>();
        List<UUID> imageMessages = new ArrayList<>();
        List<JsonNode> payloads = new ArrayList<>();
        for (MessageRow row : rows) {
            JsonNode payload = jsonMapper.readTree(row.payloadJson());
            payloads.add(payload);
            @Nullable UUID printingId = uuid(payload.path("card").path("printingId"));
            if (printingId != null) {
                printingIds.add(printingId);
            }
            if (payload.has("image")) {
                imageMessages.add(row.id());
            }
        }
        Map<UUID, String> images = catalog.frontImageUrls(printingIds);
        Map<UUID, AttachmentRow> attachments = messages.attachmentsOf(imageMessages);
        List<MessageView> result = new ArrayList<>();
        for (int index = 0; index < rows.size(); index++) {
            MessageRow row = rows.get(index);
            JsonNode payload = payloads.get(index);
            ContentModerationState state = ContentModerationState.valueOf(row.moderationState());
            boolean removed = state == ContentModerationState.REMOVED;
            result.add(
                    new MessageView(
                            row.id(),
                            row.conversationId(),
                            row.senderId(),
                            MessageKind.valueOf(row.kind()),
                            removed ? "" : row.body(),
                            removed
                                    ? MessagePayload.EMPTY
                                    : payload(payload, images, attachments.get(row.id())),
                            row.createdAt(),
                            row.editedAt(),
                            readByOther(row, visible),
                            state));
        }
        return result;
    }

    private MessagePayload payload(
            JsonNode payload, Map<UUID, String> images, @Nullable AttachmentRow attachment) {
        @Nullable CardLink card = null;
        JsonNode cardNode = payload.path("card");
        @Nullable UUID printingId = uuid(cardNode.path("printingId"));
        @Nullable UUID cardId = uuid(cardNode.path("cardId"));
        if (printingId != null && cardId != null) {
            card =
                    new CardLink(
                            printingId,
                            cardId,
                            cardNode.path("name").asString(""),
                            cardNode.hasNonNull("printingCode")
                                    ? cardNode.path("printingCode").asString()
                                    : null,
                            images.get(printingId));
        }
        @Nullable BinderLink binder = null;
        JsonNode binderNode = payload.path("binder");
        @Nullable UUID binderId = uuid(binderNode.path("binderId"));
        if (binderId != null) {
            binder =
                    new BinderLink(
                            binderId,
                            binderNode.path("name").asString(""),
                            binderNode.path("ownerHandle").asString(""));
        }
        @Nullable MessageImage image = null;
        if (attachment != null) {
            image =
                    new MessageImage(
                            uploads.urlOf(attachment.storageKey()),
                            attachment.width(),
                            attachment.height());
        }
        if (card == null && binder == null && image == null) {
            return MessagePayload.EMPTY;
        }
        return new MessagePayload(card, binder, null, image);
    }

    private static boolean readByOther(MessageRow row, Visible visible) {
        @Nullable UUID sender = row.senderId();
        if (sender == null) {
            return false;
        }
        ParticipantRow reader =
                sender.equals(visible.mine().userId()) ? visible.other() : visible.mine();
        Instant readAt = reader.lastReadAt();
        return readAt != null && !readAt.isBefore(row.createdAt());
    }

    private ConversationSummary requireSummary(UUID conversationId, UUID me) {
        SummaryRow row =
                conversations
                        .summary(conversationId, me)
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        MemberCard other =
                members.card(row.otherId()).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        return summary(me, row, other);
    }

    private ConversationSummary summary(UUID me, SummaryRow row, MemberCard other) {
        @Nullable LastMessage last = null;
        if (row.lastMessageId() != null
                && row.lastMessageAt() != null
                && row.lastMessageKind() != null) {
            last =
                    new LastMessage(
                            row.lastMessageId(),
                            row.lastMessagePreview() == null ? "" : row.lastMessagePreview(),
                            MessageKind.valueOf(row.lastMessageKind()),
                            row.lastMessageAt(),
                            row.lastMessageSenderId());
        }
        return new ConversationSummary(
                row.id(),
                new ConversationParticipant(
                        other.id(),
                        other.handle(),
                        other.displayName(),
                        other.avatarUrl(),
                        onlineStatus(me, other)),
                last,
                row.unreadCount(),
                row.muted(),
                row.archived(),
                row.createdAt());
    }

    /** Presence of a member for {@code viewerId}: HIDDEN unless they show their online status. */
    OnlineStatus onlineStatus(UUID viewerId, MemberCard member) {
        ViewerContext viewer = new ViewerContext(viewerId, false, false);
        if (!privacyPolicy.canSeeOnlineStatus(viewer, member.id(), member.privacy())) {
            return OnlineStatus.HIDDEN;
        }
        return presence.isOnline(member.id()) ? OnlineStatus.ONLINE : OnlineStatus.OFFLINE;
    }

    /** Both participant rows; 404 unless {@code me} is one of them. */
    private Participants requireParticipants(UUID me, UUID conversationId) {
        List<ParticipantRow> rows = conversations.participants(conversationId);
        @Nullable ParticipantRow mine = null;
        @Nullable ParticipantRow other = null;
        for (ParticipantRow row : rows) {
            if (row.userId().equals(me)) {
                mine = row;
            } else {
                other = row;
            }
        }
        if (mine == null || other == null) {
            throw ApiException.notFound(NOT_FOUND);
        }
        return new Participants(mine, other);
    }

    /** Participants of a conversation the caller may see: 404 when hidden by a block. */
    private Visible requireVisible(UUID me, UUID conversationId) {
        Participants participants = requireParticipants(me, conversationId);
        if (blocks.isBlockedEitherWay(me, participants.other().userId())) {
            throw ApiException.notFound(NOT_FOUND);
        }
        return new Visible(participants.mine(), participants.other());
    }

    private static @Nullable UUID uuid(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return null;
        }
        try {
            return UUID.fromString(node.asString());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static <T> T requireNonNull(@Nullable T value) {
        if (value == null) {
            throw new IllegalStateException("validated before");
        }
        return value;
    }

    private static ApiException invalid(String field, String message) {
        return ApiException.validation(
                "Validation failed", List.of(new ProblemFieldError(field, message)));
    }

    private static ApiException messagingBlocked(String message) {
        return new ApiException(ErrorCode.MESSAGING_BLOCKED, message);
    }

    /** Runs {@code action} after the surrounding transaction commits (immediately without one). */
    static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            action.run();
                        }
                    });
        } else {
            action.run();
        }
    }

    /**
     * Result of {@link #start}.
     *
     * @param conversation the conversation
     * @param created whether this call created it (201) or it existed (200)
     */
    public record Started(ConversationSummary conversation, boolean created) {}

    private record Participants(ParticipantRow mine, ParticipantRow other) {}

    private record Visible(ParticipantRow mine, ParticipantRow other) {}
}
