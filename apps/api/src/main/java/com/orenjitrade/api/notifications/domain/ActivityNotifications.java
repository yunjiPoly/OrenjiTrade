package com.orenjitrade.api.notifications.domain;

import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.domain.BinderView;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.messaging.domain.ConversationService;
import com.orenjitrade.api.notifications.infra.NotificationRepository;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.profiles.domain.MemberDirectory;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns the domain events of other modules into notifications (Phase 6): new private messages
 * (MESSAGE, at most one unread notification per conversation and none within {@link
 * #MESSAGE_THROTTLE} of the previous one; never for muted conversations; cleared when the
 * conversation is read), freshness warnings of public listings (BINDER_STALE_WARNING) and public
 * listings hidden by the freshness job (BINDER_HIDDEN, one per binder or unfiled lot and day).
 * Every notification carries a dedup key derived from the event, so a redelivered event never
 * notifies twice. Texts never contain message bodies, private notes or locations.
 */
@Service
public class ActivityNotifications {

    /** Minimum gap between two MESSAGE notifications of one conversation. */
    public static final Duration MESSAGE_THROTTLE = Duration.ofMinutes(10);

    static final String UNFILED = "unfiled";

    private final NotificationService notifications;
    private final NotificationRepository repository;
    private final ConversationService conversations;
    private final MemberDirectory members;
    private final BinderService binders;
    private final TimeProvider timeProvider;

    public ActivityNotifications(
            NotificationService notifications,
            NotificationRepository repository,
            ConversationService conversations,
            MemberDirectory members,
            BinderService binders,
            TimeProvider timeProvider) {
        this.notifications = notifications;
        this.repository = repository;
        this.conversations = conversations;
        this.members = members;
        this.binders = binders;
        this.timeProvider = timeProvider;
    }

    /**
     * A private message was sent: notify the recipient unless the conversation is muted for them,
     * they already have an unread notification of this conversation, or they got one less than
     * {@link #MESSAGE_THROTTLE} ago.
     */
    @Transactional
    public @Nullable NotifyResult messageSent(
            UUID messageId,
            UUID conversationId,
            UUID senderId,
            UUID recipientId,
            String kind,
            Instant sentAt) {
        String dedupKey = "message:" + messageId;
        if (repository.existsByDedupKey(dedupKey)
                || conversations.isMutedFor(recipientId, conversationId)) {
            return null;
        }
        repository.lock("message-throttle:" + conversationId + ":" + recipientId);
        if (repository.hasRecentMessageNotification(
                recipientId, conversationId, sentAt.minus(MESSAGE_THROTTLE))) {
            return null;
        }
        String sender = members.card(senderId).map(MemberCard::displayName).orElse("A collector");
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        data.put("conversationId", conversationId.toString());
        data.put("messageId", messageId.toString());
        data.put("senderId", senderId.toString());
        data.put("deepLink", "/messages/" + conversationId);
        return notifications.notify(
                new NotificationRequest(
                        recipientId,
                        NotificationType.MESSAGE,
                        "New message from " + sender,
                        sender + " " + messagePhrase(kind) + ".",
                        data,
                        dedupKey));
    }

    /** The reader opened the conversation: its MESSAGE notifications are read too. */
    @Transactional
    public int conversationRead(UUID readerId, UUID conversationId) {
        return notifications.markConversationRead(readerId, conversationId);
    }

    /**
     * Public listings of a binder (or the owner's unfiled public items when {@code binderId} is
     * null) will be hidden soon unless the owner confirms them.
     */
    @Transactional
    public @Nullable NotifyResult freshnessWarning(
            UUID ownerId,
            @Nullable UUID binderId,
            int itemCount,
            Instant hidesAt,
            Instant warnedAt) {
        @Nullable String binderName = null;
        if (binderId != null) {
            @Nullable BinderView binder = binders.findAll(List.of(binderId)).get(binderId);
            if (binder == null || !binder.ownerId().equals(ownerId)) {
                return null;
            }
            binderName = binder.name();
        }
        long days =
                Math.max(
                        1,
                        (long)
                                Math.ceil(
                                        Duration.between(timeProvider.now(), hidesAt).toHours()
                                                / 24.0));
        String when = days == 1 ? "within a day" : "in " + days + " days";
        String body =
                binderName != null
                        ? "Your binder \""
                                + binderName
                                + "\" will be hidden from the map "
                                + when
                                + " unless you confirm it is still available."
                        : itemCount
                                + (itemCount == 1 ? " unfiled card" : " unfiled cards")
                                + " will be hidden from the map "
                                + when
                                + " unless you confirm "
                                + (itemCount == 1 ? "it is" : "they are")
                                + " still available.";
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        data.put("binderId", binderId == null ? null : binderId.toString());
        data.put("itemCount", itemCount);
        data.put("hidesAt", hidesAt.toString());
        data.put("deepLink", inventoryLink(binderId));
        return notifications.notify(
                new NotificationRequest(
                        ownerId,
                        NotificationType.BINDER_STALE_WARNING,
                        "Confirm your listings are still available",
                        body,
                        data,
                        "binder-warning:"
                                + ownerId
                                + ":"
                                + target(binderId)
                                + ":"
                                + warnedAt.getEpochSecond()));
    }

    /**
     * A public binder became HIDDEN (freshness job). Private binders and binders confirmed again
     * since are ignored.
     */
    @Transactional
    public @Nullable NotifyResult binderHidden(UUID ownerId, UUID binderId, Instant hiddenAt) {
        @Nullable BinderView binder = binders.findAll(List.of(binderId)).get(binderId);
        if (binder == null
                || !binder.ownerId().equals(ownerId)
                || binder.visibility() == ListingVisibility.PRIVATE
                || binder.freshnessState() != FreshnessState.HIDDEN) {
            return null;
        }
        return hidden(ownerId, binderId, binder.name(), 0, hiddenAt);
    }

    /** Public items became HIDDEN (freshness job), grouped per binder ({@code null} = unfiled). */
    @Transactional
    public @Nullable NotifyResult itemsHidden(
            UUID ownerId, @Nullable UUID binderId, int itemCount, Instant hiddenAt) {
        @Nullable String binderName = null;
        if (binderId != null) {
            @Nullable BinderView binder = binders.findAll(List.of(binderId)).get(binderId);
            if (binder == null || !binder.ownerId().equals(ownerId)) {
                return null;
            }
            binderName = binder.name();
        }
        return hidden(ownerId, binderId, binderName, itemCount, hiddenAt);
    }

    private NotifyResult hidden(
            UUID ownerId,
            @Nullable UUID binderId,
            @Nullable String binderName,
            int itemCount,
            Instant hiddenAt) {
        String body =
                binderName != null
                        ? "Your binder \""
                                + binderName
                                + "\" was hidden from the map because it was not confirmed"
                                + " recently. Confirm it to show it again."
                        : itemCount
                                + (itemCount == 1 ? " unfiled card was" : " unfiled cards were")
                                + " hidden from the map because they were not confirmed"
                                + " recently. Confirm them to show them again.";
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        data.put("binderId", binderId == null ? null : binderId.toString());
        data.put("itemCount", itemCount);
        data.put("deepLink", inventoryLink(binderId));
        return notifications.notify(
                new NotificationRequest(
                        ownerId,
                        NotificationType.BINDER_HIDDEN,
                        "Listings hidden from the map",
                        body,
                        data,
                        "binder-hidden:"
                                + ownerId
                                + ":"
                                + target(binderId)
                                + ":"
                                + LocalDate.ofInstant(hiddenAt, ZoneOffset.UTC)));
    }

    private static String target(@Nullable UUID binderId) {
        return binderId == null ? UNFILED : binderId.toString();
    }

    private static String inventoryLink(@Nullable UUID binderId) {
        return "/inventory?binder=" + target(binderId);
    }

    /** What the sender did, by message kind (never the text itself). */
    static String messagePhrase(String kind) {
        return switch (kind.toUpperCase(Locale.ROOT)) {
            case "CARD_LINK" -> "shared a card with you";
            case "BINDER_LINK" -> "shared a binder with you";
            case "IMAGE" -> "sent you a photo";
            case "OFFER_LINK" -> "sent you an offer";
            default -> "sent you a message";
        };
    }
}
