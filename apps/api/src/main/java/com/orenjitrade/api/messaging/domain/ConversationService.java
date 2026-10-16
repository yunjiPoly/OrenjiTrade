package com.orenjitrade.api.messaging.domain;

import com.orenjitrade.api.binders.domain.BinderLink;
import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.domain.ChatDeckCore;
import com.orenjitrade.api.binders.domain.PublicBinderService;
import com.orenjitrade.api.cards.domain.CardLink;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.inventory.domain.ChatCard;
import com.orenjitrade.api.inventory.domain.InventorySales;
import com.orenjitrade.api.location.api.PlaceResponse;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.location.domain.PublicPlace;
import com.orenjitrade.api.messaging.domain.RealtimeNotices.ConversationChanged;
import com.orenjitrade.api.messaging.domain.RealtimeNotices.ReadReceipt;
import com.orenjitrade.api.messaging.events.MessageRead;
import com.orenjitrade.api.messaging.events.MessageSent;
import com.orenjitrade.api.messaging.infra.ConversationRepository;
import com.orenjitrade.api.messaging.infra.ConversationRepository.ParticipantRow;
import com.orenjitrade.api.messaging.infra.ConversationRepository.SubjectRef;
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
import com.orenjitrade.api.users.domain.ConsentService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
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
 *
 * <p>Phase 8: OFFER_LINK messages link an offer between the two participants, and the offers and
 * trades modules post SYSTEM messages ({@link #postSystemMessage}) into the pair conversation; the
 * linked offer's current state comes from the offers module's {@link OfferLinkResolver}.
 *
 * <p>Stage R4 (owner spec 2026-10-14, sections 10 and 12 "Messaging and sales"): a chat has a
 * subject, the card or deck core it is about ({@link ConversationSubject}): {@code POST
 * /conversations} pins the one a buyer opened from a listing (public, or the caller's own), and a
 * CARD_LINK of the sender's own card ({@code inventoryItemId}) pins that card; the latest pin wins.
 * When it stops being on offer the buyer still sees its name and picture, without a price. The
 * deals module posts the SYSTEM message of each sale (with its {@link SaleNotice}) and withdraws it
 * on an undo ({@link #withdrawSystemMessage}); whether a chat sold its subject comes from its
 * {@link ChatSaleStatus}. The other participant's place is their state or province and country
 * while they are discoverable, never a city (ADR 0017).
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
    private final ConsentService consents;
    private final PresenceStore presence;
    private final ModerationService moderation;
    private final CatalogService catalog;
    private final PublicBinderService publicBinders;
    private final ImageUploadService uploads;
    private final InventorySales inventorySales;
    private final BinderService binderService;
    private final LocationService locations;
    private final RealtimePublisher realtime;
    private final ObjectProvider<OfferLinkResolver> offerLinks;
    private final ObjectProvider<ChatSaleStatus> saleStatus;
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
            ConsentService consents,
            PresenceStore presence,
            ModerationService moderation,
            CatalogService catalog,
            PublicBinderService publicBinders,
            ImageUploadService uploads,
            InventorySales inventorySales,
            BinderService binderService,
            LocationService locations,
            RealtimePublisher realtime,
            ObjectProvider<OfferLinkResolver> offerLinks,
            ObjectProvider<ChatSaleStatus> saleStatus,
            ApplicationEventPublisher events,
            TimeProvider timeProvider,
            JsonMapper jsonMapper) {
        this.conversations = conversations;
        this.messages = messages;
        this.blocks = blocks;
        this.members = members;
        this.privacyPolicy = privacyPolicy;
        this.profiles = profiles;
        this.consents = consents;
        this.presence = presence;
        this.moderation = moderation;
        this.catalog = catalog;
        this.publicBinders = publicBinders;
        this.uploads = uploads;
        this.inventorySales = inventorySales;
        this.binderService = binderService;
        this.locations = locations;
        this.realtime = realtime;
        this.offerLinks = offerLinks;
        this.saleStatus = saleStatus;
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
        List<ConversationSummary> items = summaries(me, slice);
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
     * messaging permission refuses the caller (new conversations only), {@code 403
     * AGE_CONFIRMATION_REQUIRED} until the caller confirmed being 18 or older.
     */
    @Transactional
    public Started start(UUID me, UUID recipientId) {
        return start(me, recipientId, null, null);
    }

    /**
     * {@code POST /conversations} with an optional subject (stage R4): the card ({@code
     * subjectItemId}) or deck core ({@code subjectBinderId}) the chat is about becomes its subject,
     * the latest wins. It must be the recipient's and public (a buyer opening it from a listing),
     * or the caller's own and still there: {@code 404} otherwise (private, deleted, sold), {@code
     * 400} for both at once, for someone else's card and for a binder that is not a deck core.
     */
    @Transactional
    public Started start(
            UUID me,
            UUID recipientId,
            @Nullable UUID subjectItemId,
            @Nullable UUID subjectBinderId) {
        if (me.equals(recipientId)) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("recipientId", "You cannot message yourself")));
        }
        if (subjectItemId != null && subjectBinderId != null) {
            throw invalid("subjectBinderId", "Pin a card or a deck core, not both");
        }
        consents.requireAgeConfirmed(me);
        Instant now = timeProvider.now();
        MemberCard recipient =
                members.card(recipientId)
                        .filter(card -> card.activeAt(now))
                        .orElseThrow(() -> ApiException.notFound("Collector not found"));
        if (blocks.isBlockedEitherWay(me, recipientId)) {
            throw messagingBlocked("You cannot message this collector");
        }
        // The subject first: held FOR KEY SHARE before the conversation row is written.
        boolean pinning = subjectItemId != null || subjectBinderId != null;
        if (pinning) {
            requirePinnable(me, recipientId, subjectItemId, subjectBinderId);
        }
        Optional<UUID> existing = conversations.findByPair(me, recipientId);
        if (existing.isPresent()) {
            if (pinning) {
                conversations.setSubject(
                        existing.get(), subjectItemId, subjectBinderId, me, subjectTime());
                publishSubjectChanged(existing.get(), me, recipientId);
            }
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
        if (pinning) {
            conversations.setSubject(
                    created.conversationId(), subjectItemId, subjectBinderId, me, subjectTime());
            publishSubjectChanged(created.conversationId(), me, recipientId);
        }
        return new Started(requireSummary(created.conversationId(), me), created.created());
    }

    /**
     * {@code GET /conversations/{id}} (stage R4): one conversation of the caller with its subject;
     * {@code 404} for non-participants and conversations hidden by a block.
     */
    @Transactional(readOnly = true)
    public ConversationSummary get(UUID me, UUID conversationId) {
        requireVisible(me, conversationId);
        return requireSummary(conversationId, me);
    }

    /**
     * What the deals module needs to mark a chat's subject sold (stage R4): the other participant
     * and the stored subject. {@code 404} for non-participants and conversations hidden by a block.
     */
    @Transactional(readOnly = true)
    public ChatForSale chatForSale(UUID me, UUID conversationId) {
        Visible visible = requireVisible(me, conversationId);
        SubjectRef subject =
                conversations
                        .subjectOf(conversationId)
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        return new ChatForSale(
                conversationId, visible.other().userId(), subject.itemId(), subject.binderId());
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
     * refuse, {@code 429 RATE_LIMITED} above the rate rule (30 per minute by default), {@code 403
     * AGE_CONFIRMATION_REQUIRED} until the caller confirmed being 18 or older.
     */
    @Transactional
    public MessageView send(UUID me, UUID conversationId, NewMessage input) {
        consents.requireAgeConfirmed(me);
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
        @Nullable UUID pinItem = null;
        switch (input.kind()) {
            case CARD_LINK -> {
                if (input.inventoryItemId() != null) {
                    // Stage R4: the sender's own card, held FOR KEY SHARE before the
                    // conversation row is written (it becomes the chat's subject).
                    ChatCard own = requireOwnCard(me, input.inventoryItemId());
                    ObjectNode node = payload.putObject("card");
                    node.put("printingId", own.printingId().toString());
                    node.put("cardId", own.cardId().toString());
                    node.put("name", own.name());
                    if (own.printingCode() != null) {
                        node.put("printingCode", own.printingCode());
                    }
                    ObjectNode item = payload.putObject("item");
                    item.put("itemId", own.itemId().toString());
                    item.put("ownerId", me.toString());
                    if (own.askingPriceText() != null) {
                        item.put("askingPriceText", own.askingPriceText());
                    }
                    if (own.rarity() != null) {
                        item.put("rarity", own.rarity());
                    }
                    linkName = own.name();
                    pinItem = own.itemId();
                    break;
                }
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
            case OFFER_LINK -> {
                UUID offerId = requireNonNull(input.offerId());
                @Nullable OfferLinkResolver resolver = offerLinks.getIfAvailable();
                @Nullable OfferLink offer =
                        resolver == null || !resolver.isBetween(offerId, me, otherId)
                                ? null
                                : resolver.links(me, List.of(offerId)).get(offerId);
                if (offer == null) {
                    throw invalid("offerId", "Only offers between the two of you can be shared");
                }
                putOffer(payload, offer);
                linkName = offer.summary();
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
                // TEXT: nothing to resolve (SYSTEM was refused by validate()).
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
        if (pinItem != null) {
            conversations.setSubject(conversationId, pinItem, null, me, now);
        }
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
        if (pinItem != null) {
            publishSubjectChanged(conversationId, me, otherId);
        }
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

    /**
     * Posts a SYSTEM message (no sender) into the DIRECT conversation of two collectors, creating
     * the conversation when absent (Phase 8 offer and trade updates; the offer itself is the
     * consent to talk, so the messaging permission does not apply). Idempotent per {@link
     * SystemNotice#dedupKey()}. Nothing is posted while a block exists in either direction or when
     * one of the accounts is unknown. Pushed to both participants after commit; no {@link
     * MessageSent} is published (the offers and trades modules notify on their own events).
     *
     * @return the message id (also for a repeated key), empty when nothing was posted
     */
    @Transactional
    public Optional<UUID> postSystemMessage(SystemNotice notice) {
        UUID initiator = notice.initiatorId();
        UUID other = notice.otherId();
        if (initiator.equals(other) || blocks.isBlockedEitherWay(initiator, other)) {
            return Optional.empty();
        }
        Optional<UUID> existing = messages.findIdBySystemKey(notice.dedupKey());
        if (existing.isPresent()) {
            return existing;
        }
        if (members.cards(List.of(initiator, other)).size() < 2) {
            return Optional.empty();
        }
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        UUID conversationId =
                conversations
                        .findByPair(initiator, other)
                        .orElseGet(
                                () ->
                                        conversations
                                                .createDirect(
                                                        UUID.randomUUID(), initiator, other, now)
                                                .conversationId());
        String body =
                notice.body().length() > BODY_MAX
                        ? notice.body().substring(0, BODY_MAX)
                        : notice.body();
        ObjectNode payload = jsonMapper.createObjectNode();
        if (notice.offer() != null) {
            putOffer(payload, notice.offer());
        }
        if (notice.sale() != null) {
            putSale(payload, notice.sale());
        }
        payload.put("systemKey", notice.dedupKey());
        UUID messageId = UUID.randomUUID();
        if (!messages.insertSystemIfAbsent(
                messageId, conversationId, body, jsonMapper.writeValueAsString(payload), now)) {
            return messages.findIdBySystemKey(notice.dedupKey());
        }
        conversations.updateLastMessage(
                conversationId,
                messageId,
                now,
                MessagePreviews.of(MessageKind.SYSTEM, body, null),
                MessageKind.SYSTEM.name(),
                null);
        conversations.unarchive(conversationId);
        if (notice.readByInitiator()) {
            // A sale: the seller marked it from the chat they read, so it is new to the buyer only.
            conversations.markRead(conversationId, initiator, now, messageId);
        }
        MessageRow stored =
                messages.find(conversationId, messageId)
                        .orElseThrow(() -> new IllegalStateException("Message not stored"));
        for (UUID recipient : List.of(initiator, other)) {
            Participants participants = requireParticipants(recipient, conversationId);
            MessageView view =
                    views(List.of(stored), new Visible(participants.mine(), participants.other()))
                            .get(0);
            afterCommit(() -> realtime.publish(recipient, RealtimeDestinations.MESSAGES, view));
        }
        log.debug("System message {} posted in conversation {}", messageId, conversationId);
        return Optional.of(messageId);
    }

    /**
     * Withdraws the SYSTEM sale message posted with {@code dedupKey} (the undo of a sale, stage
     * R4): it leaves the conversation for both collectors (pages skip it, the conversation's last
     * message goes back to the newest one left), and its copy, marked undone, is pushed to both so
     * their phones drop it. Nothing happens when no live message has the key.
     */
    @Transactional
    public void withdrawSystemMessage(String dedupKey) {
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        Optional<MessageRow> withdrawn = messages.withdrawSaleMessage(dedupKey, now);
        if (withdrawn.isEmpty()) {
            return;
        }
        UUID conversationId = withdrawn.get().conversationId();
        refreshLastMessage(conversationId);
        for (ParticipantRow participant : conversations.participants(conversationId)) {
            UUID recipient = participant.userId();
            Participants participants = requireParticipants(recipient, conversationId);
            MessageView view =
                    views(
                                    List.of(withdrawn.get()),
                                    new Visible(participants.mine(), participants.other()))
                            .get(0);
            afterCommit(() -> realtime.publish(recipient, RealtimeDestinations.MESSAGES, view));
        }
        log.debug("System message withdrawn in conversation {}", conversationId);
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

    /**
     * Whether new messages of the conversation must not notify {@code userId} (Phase 6): the
     * participant muted it, or is not a participant at all.
     */
    @Transactional(readOnly = true)
    public boolean isMutedFor(UUID userId, UUID conversationId) {
        return conversations
                .participant(conversationId, userId)
                .map(ParticipantRow::muted)
                .orElse(true);
    }

    /**
     * Messages per sender of a conversation (Phase 7 rating eligibility: a conversation qualifies
     * with at least 3 messages from each side). Deleted and SYSTEM messages are not counted.
     */
    @Transactional(readOnly = true)
    public Map<UUID, Long> messageCountsBySender(UUID conversationId) {
        return messages.countsBySender(conversationId);
    }

    /** The two participants of a conversation (empty for unknown ids). */
    @Transactional(readOnly = true)
    public List<UUID> participantIds(UUID conversationId) {
        return conversations.participants(conversationId).stream()
                .map(ParticipantRow::userId)
                .toList();
    }

    /**
     * The most recent messages of a conversation for a moderator acting on a report that names this
     * conversation (Phase 7 contract: no private message bodies unless the report's context points
     * at the conversation). Newest first; the caller authorizes and audits the access. Link and
     * photo messages carry their kind only.
     */
    @Transactional(readOnly = true)
    public List<ModerationMessage> messagesForModeration(UUID conversationId, int limit) {
        List<ModerationMessage> result = new ArrayList<>();
        for (MessageRow row : messages.page(conversationId, null, limit)) {
            result.add(
                    new ModerationMessage(
                            row.id(),
                            row.senderId(),
                            MessageKind.valueOf(row.kind()),
                            row.body(),
                            row.createdAt(),
                            ContentModerationState.valueOf(row.moderationState())));
        }
        return result;
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
                if (input.cardPrintingId() == null && input.inventoryItemId() == null) {
                    errors.add(
                            new ProblemFieldError(
                                    "cardPrintingId",
                                    "is required for CARD_LINK messages (or inventoryItemId)"));
                }
                if (input.cardPrintingId() != null && input.inventoryItemId() != null) {
                    errors.add(
                            new ProblemFieldError(
                                    "inventoryItemId",
                                    "share a printing or one of your cards, not both"));
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
            case OFFER_LINK -> {
                if (input.offerId() == null) {
                    errors.add(
                            new ProblemFieldError(
                                    "offerId", "is required for OFFER_LINK messages"));
                }
            }
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
        Set<UUID> offerIds = new LinkedHashSet<>();
        List<UUID> imageMessages = new ArrayList<>();
        List<JsonNode> payloads = new ArrayList<>();
        for (MessageRow row : rows) {
            JsonNode payload = jsonMapper.readTree(row.payloadJson());
            payloads.add(payload);
            @Nullable UUID printingId = uuid(payload.path("card").path("printingId"));
            if (printingId != null) {
                printingIds.add(printingId);
            }
            @Nullable UUID offerId = uuid(payload.path("offer").path("offerId"));
            if (offerId != null) {
                offerIds.add(offerId);
            }
            if (payload.has("image")) {
                imageMessages.add(row.id());
            }
        }
        Map<UUID, String> images = catalog.frontImageUrls(printingIds);
        Map<UUID, OfferLink> offers = resolveOffers(visible.mine().userId(), offerIds);
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
                                    : payload(payload, images, offers, attachments.get(row.id())),
                            row.createdAt(),
                            row.editedAt(),
                            readByOther(row, visible),
                            state));
        }
        return result;
    }

    private MessagePayload payload(
            JsonNode payload,
            Map<UUID, String> images,
            Map<UUID, OfferLink> offers,
            @Nullable AttachmentRow attachment) {
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
        @Nullable OfferLink offer = null;
        JsonNode offerNode = payload.path("offer");
        @Nullable UUID offerId = uuid(offerNode.path("offerId"));
        if (offerId != null) {
            offer = offers.get(offerId);
            if (offer == null) {
                // The state stored with the message (the resolver answers for the parties only);
                // the picture is never stored with a message.
                offer =
                        new OfferLink(
                                offerId,
                                offerNode.path("status").asString(""),
                                offerNode.path("summary").asString(""),
                                null);
            }
        }
        @Nullable MessageImage image = null;
        if (attachment != null) {
            image =
                    new MessageImage(
                            uploads.urlOf(attachment.storageKey()),
                            attachment.width(),
                            attachment.height());
        }
        @Nullable SharedItem item = sharedItem(payload.path("item"));
        @Nullable SaleNotice sale = saleNotice(payload.path("sale"));
        if (card == null
                && binder == null
                && offer == null
                && image == null
                && item == null
                && sale == null) {
            return MessagePayload.EMPTY;
        }
        return new MessagePayload(card, binder, offer, image, item, sale);
    }

    private static @Nullable SharedItem sharedItem(JsonNode node) {
        @Nullable UUID itemId = uuid(node.path("itemId"));
        @Nullable UUID ownerId = uuid(node.path("ownerId"));
        if (itemId == null || ownerId == null) {
            return null;
        }
        return new SharedItem(itemId, ownerId, text(node, "askingPriceText"), text(node, "rarity"));
    }

    private static @Nullable SaleNotice saleNotice(JsonNode node) {
        @Nullable UUID saleId = uuid(node.path("saleId"));
        @Nullable UUID sellerId = uuid(node.path("sellerId"));
        @Nullable UUID buyerId = uuid(node.path("buyerId"));
        if (saleId == null || sellerId == null || buyerId == null) {
            return null;
        }
        SubjectKind kind =
                "DECK_CORE".equals(node.path("kind").asString(""))
                        ? SubjectKind.DECK_CORE
                        : SubjectKind.CARD;
        return new SaleNotice(
                saleId,
                sellerId,
                buyerId,
                kind,
                node.path("name").asString(""),
                node.path("quantity").asInt(1),
                text(node, "trackingNumber"),
                node.path("undone").asBoolean(false));
    }

    private static @Nullable String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() ? null : value.asString();
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
        List<ConversationSummary> found = summaries(me, List.of(row));
        if (found.isEmpty()) {
            throw ApiException.notFound(NOT_FOUND);
        }
        return found.get(0);
    }

    /**
     * Summaries of conversation rows for {@code me}, in order (rows whose other participant is
     * unknown are dropped): the other participants, their places, the subjects and their sales are
     * read for the whole list at once.
     */
    private List<ConversationSummary> summaries(UUID me, List<SummaryRow> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<UUID, MemberCard> others =
                members.cards(rows.stream().map(SummaryRow::otherId).distinct().toList());
        List<UUID> discoverable =
                others.values().stream()
                        .filter(card -> card.privacy().discoverable())
                        .map(MemberCard::id)
                        .toList();
        Map<UUID, PublicPlace> places =
                discoverable.isEmpty() ? Map.of() : locations.publicPlacesOf(discoverable);
        Set<UUID> itemIds = new HashSet<>();
        Set<UUID> binderIds = new HashSet<>();
        List<ChatSaleStatus.Subject> subjects = new ArrayList<>();
        for (SummaryRow row : rows) {
            SubjectRef ref = row.subject();
            if (ref.itemId() != null) {
                itemIds.add(ref.itemId());
            }
            if (ref.binderId() != null) {
                binderIds.add(ref.binderId());
            }
            if (!ref.isEmpty()) {
                subjects.add(
                        new ChatSaleStatus.Subject(
                                row.id(), ref.itemId(), ref.binderId(), ref.setAt()));
            }
        }
        Map<UUID, ChatCard> cards = inventorySales.chatCards(itemIds);
        Map<UUID, ChatDeckCore> cores = binderService.chatDeckCores(binderIds);
        @Nullable ChatSaleStatus status = saleStatus.getIfAvailable();
        Set<UUID> sold =
                status == null || subjects.isEmpty() ? Set.of() : status.soldSubjects(subjects);
        List<ConversationSummary> result = new ArrayList<>();
        for (SummaryRow row : rows) {
            @Nullable MemberCard other = others.get(row.otherId());
            if (other == null) {
                continue;
            }
            result.add(
                    summary(
                            me,
                            row,
                            other,
                            places.get(other.id()),
                            subject(me, row, cards, cores, sold.contains(row.id()))));
        }
        return result;
    }

    private ConversationSummary summary(
            UUID me,
            SummaryRow row,
            MemberCard other,
            @Nullable PublicPlace place,
            @Nullable ConversationSubject subject) {
        @Nullable LastMessage last = null;
        if (row.lastMessageId() != null
                && row.lastMessageAt() != null
                && row.lastMessageKind() != null) {
            @Nullable SystemMessageTopic topic = null;
            @Nullable SaleNotice sale = null;
            if (row.lastSystemJson() != null) {
                JsonNode system = jsonMapper.readTree(row.lastSystemJson());
                sale = saleNotice(system.path("sale"));
                if (sale != null) {
                    topic = SystemMessageTopic.SALE;
                } else if (system.path("offer").asBoolean(false)) {
                    topic = SystemMessageTopic.OFFER;
                }
            }
            last =
                    new LastMessage(
                            row.lastMessageId(),
                            row.lastMessagePreview() == null ? "" : row.lastMessagePreview(),
                            MessageKind.valueOf(row.lastMessageKind()),
                            row.lastMessageAt(),
                            row.lastMessageSenderId(),
                            topic,
                            sale);
        }
        return new ConversationSummary(
                row.id(),
                new ConversationParticipant(
                        other.id(),
                        other.handle(),
                        other.displayName(),
                        other.avatarUrl(),
                        onlineStatus(me, other),
                        place == null ? null : PlaceResponse.from(place)),
                last,
                row.unreadCount(),
                row.muted(),
                row.archived(),
                row.createdAt(),
                subject);
    }

    /**
     * The chat's subject as {@code me} sees it: its owner sees everything; the other collector sees
     * its price only while it is on offer (in the inventory, not sold as a deck core, and public or
     * shared by its owner in this chat). A subject purged with its account, or a binder deleted for
     * good, is none.
     */
    private static @Nullable ConversationSubject subject(
            UUID me,
            SummaryRow row,
            Map<UUID, ChatCard> cards,
            Map<UUID, ChatDeckCore> cores,
            boolean sold) {
        SubjectRef ref = row.subject();
        if (ref.itemId() != null) {
            @Nullable ChatCard card = cards.get(ref.itemId());
            if (card == null) {
                return null;
            }
            boolean owner = card.ownerId().equals(me);
            boolean sharedByOwner = card.ownerId().equals(ref.setBy());
            boolean listed = card.live() && (card.listed() || sharedByOwner);
            return new ConversationSubject(
                    SubjectKind.CARD,
                    card.itemId(),
                    card.ownerId(),
                    card.name(),
                    card.printingCode(),
                    card.rarity(),
                    card.cardId(),
                    card.printingId(),
                    card.imageUrl(),
                    owner || listed ? card.askingPriceText() : null,
                    sold,
                    listed,
                    owner && card.live() ? card.quantity() : null);
        }
        if (ref.binderId() != null) {
            @Nullable ChatDeckCore core = cores.get(ref.binderId());
            if (core == null) {
                return null;
            }
            boolean owner = core.ownerId().equals(me);
            boolean sharedByOwner = core.ownerId().equals(ref.setBy());
            boolean listed =
                    core.sellsAsCore()
                            && core.soldAt() == null
                            && (core.effectivePublic() || sharedByOwner);
            return new ConversationSubject(
                    SubjectKind.DECK_CORE,
                    core.id(),
                    core.ownerId(),
                    core.name(),
                    null,
                    null,
                    null,
                    null,
                    core.imageUrl(),
                    owner || listed ? core.askingPriceText() : null,
                    sold,
                    listed,
                    null);
        }
        return null;
    }

    /**
     * Checks a subject {@link #start} is asked to pin and holds it {@code FOR KEY SHARE} until the
     * transaction ends (before the conversation row is written).
     */
    private void requirePinnable(
            UUID me, UUID recipientId, @Nullable UUID itemId, @Nullable UUID binderId) {
        if (itemId != null) {
            if (!inventorySales.lockForReference(itemId)) {
                throw ApiException.notFound("Card not found");
            }
            @Nullable ChatCard card = inventorySales.chatCards(List.of(itemId)).get(itemId);
            if (card == null) {
                throw ApiException.notFound("Card not found");
            }
            boolean mine = card.ownerId().equals(me);
            if (!mine && !card.ownerId().equals(recipientId)) {
                throw invalid("subjectItemId", "This card belongs to neither of you");
            }
            if (mine ? !card.live() : !card.listed()) {
                throw ApiException.notFound("Card not found");
            }
            return;
        }
        UUID id = requireNonNull(binderId);
        if (!binderService.lockForReference(id)) {
            throw ApiException.notFound("Deck core not found");
        }
        @Nullable ChatDeckCore core = binderService.chatDeckCores(List.of(id)).get(id);
        if (core == null) {
            throw ApiException.notFound("Deck core not found");
        }
        boolean mine = core.ownerId().equals(me);
        if (!mine && !core.ownerId().equals(recipientId)) {
            throw invalid("subjectBinderId", "This deck core belongs to neither of you");
        }
        if (!core.sellsAsCore()) {
            throw invalid("subjectBinderId", "Only a deck core can be what a chat is about");
        }
        if (core.soldAt() != null || (!mine && !core.effectivePublic())) {
            throw ApiException.notFound("Deck core not found");
        }
    }

    /** The sender's own live card for a CARD_LINK (stage R4), held {@code FOR KEY SHARE}. */
    private ChatCard requireOwnCard(UUID me, UUID itemId) {
        if (!inventorySales.lockForReference(itemId)) {
            throw invalid("inventoryItemId", "Only your own cards can be shared this way");
        }
        @Nullable ChatCard card = inventorySales.chatCards(List.of(itemId)).get(itemId);
        if (card == null || !card.ownerId().equals(me) || !card.live()) {
            throw invalid("inventoryItemId", "Only your own cards can be shared this way");
        }
        return card;
    }

    /**
     * Tells both collectors, once the transaction commits, that the chat's card or deck core was
     * pinned (again): their phones read the conversation again, so the seller's pinned bar and its
     * Mark as sold follow a pin made by the other collector (stage R4).
     */
    private void publishSubjectChanged(UUID conversationId, UUID me, UUID otherId) {
        ConversationChanged notice = new ConversationChanged(conversationId);
        afterCommit(
                () -> {
                    realtime.publish(otherId, RealtimeDestinations.CONVERSATIONS, notice);
                    realtime.publish(me, RealtimeDestinations.CONVERSATIONS, notice);
                });
    }

    /** When a subject pinned now counts from (microseconds, as message times). */
    private Instant subjectTime() {
        return timeProvider.now().truncatedTo(ChronoUnit.MICROS);
    }

    /** The newest message left becomes the conversation's last message again. */
    private void refreshLastMessage(UUID conversationId) {
        List<MessageRow> newest = messages.page(conversationId, null, 1);
        if (newest.isEmpty()) {
            conversations.clearLastMessage(conversationId);
            return;
        }
        MessageRow row = newest.get(0);
        MessageKind kind = MessageKind.valueOf(row.kind());
        JsonNode payload = jsonMapper.readTree(row.payloadJson());
        @Nullable String linkName =
                switch (kind) {
                    case CARD_LINK -> text(payload.path("card"), "name");
                    case BINDER_LINK -> text(payload.path("binder"), "name");
                    default -> null;
                };
        conversations.updateLastMessage(
                conversationId,
                row.id(),
                row.createdAt(),
                MessagePreviews.of(kind, row.body(), linkName),
                kind.name(),
                row.senderId());
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

    private static void putSale(ObjectNode payload, SaleNotice sale) {
        ObjectNode node = payload.putObject("sale");
        node.put("saleId", sale.saleId().toString());
        node.put("sellerId", sale.sellerId().toString());
        node.put("buyerId", sale.buyerId().toString());
        node.put("kind", sale.kind().name());
        node.put("name", sale.name());
        node.put("quantity", sale.quantity());
        if (sale.trackingNumber() != null) {
            node.put("trackingNumber", sale.trackingNumber());
        }
        node.put("undone", sale.undone());
    }

    private void putOffer(ObjectNode payload, OfferLink offer) {
        ObjectNode node = payload.putObject("offer");
        node.put("offerId", offer.id().toString());
        node.put("status", offer.status());
        node.put("summary", offer.summary());
    }

    /** Current state of linked offers for a participant (empty without the offers module). */
    private Map<UUID, OfferLink> resolveOffers(UUID viewerId, Collection<UUID> offerIds) {
        if (offerIds.isEmpty()) {
            return Map.of();
        }
        @Nullable OfferLinkResolver resolver = offerLinks.getIfAvailable();
        if (resolver == null) {
            return Map.of();
        }
        try {
            return resolver.links(viewerId, offerIds);
        } catch (RuntimeException e) {
            log.warn("Offer links not resolved: {}", e.getClass().getSimpleName());
            return Map.of();
        }
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

    /**
     * A chat whose subject the caller may mark sold (stage R4, {@link #chatForSale}).
     *
     * @param conversationId the conversation
     * @param otherId the other participant (the buyer when the caller sells)
     * @param subjectItemId the card it is about, if any
     * @param subjectBinderId the deck core it is about, if any
     */
    public record ChatForSale(
            UUID conversationId,
            UUID otherId,
            @Nullable UUID subjectItemId,
            @Nullable UUID subjectBinderId) {}

    /**
     * A message as shown to a moderator reviewing a report.
     *
     * @param id message id
     * @param senderId sender ({@code null} for deleted accounts)
     * @param kind kind
     * @param body text (also of removed messages: moderators need the evidence)
     * @param createdAt when it was sent
     * @param moderationState OK, FLAGGED or REMOVED
     */
    public record ModerationMessage(
            UUID id,
            @Nullable UUID senderId,
            MessageKind kind,
            String body,
            Instant createdAt,
            ContentModerationState moderationState) {}

    private record Participants(ParticipantRow mine, ParticipantRow other) {}

    private record Visible(ParticipantRow mine, ParticipantRow other) {}
}
