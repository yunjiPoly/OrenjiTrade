package com.orenjitrade.api.notifications.infra;

import com.google.firebase.messaging.AndroidConfig;
import com.google.firebase.messaging.BatchResponse;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.MulticastMessage;
import com.google.firebase.messaging.Notification;
import com.google.firebase.messaging.SendResponse;
import com.orenjitrade.api.notifications.domain.PushProvider;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Firebase Cloud Messaging adapter (ADR 0013: Firebase Admin SDK, no Spring Cloud GCP), created
 * only with {@code PUSH_PROVIDER=fcm} (cloud environments, Application Default Credentials). Sends
 * one multicast per batch of at most {@value #MAX_TOKENS_PER_REQUEST} tokens and reports the tokens
 * FCM declares {@code UNREGISTERED}, {@code INVALID_ARGUMENT} or {@code SENDER_ID_MISMATCH} so the
 * dispatcher invalidates them. Delivery problems are logged (without tokens) and reported, never
 * thrown.
 */
public class FcmPushProvider implements PushProvider {

    public static final String NAME = "fcm";

    /** FCM's multicast limit. */
    static final int MAX_TOKENS_PER_REQUEST = 500;

    /** Error codes meaning the token will never work again. */
    static final Set<MessagingErrorCode> INVALID_TOKEN_CODES =
            Set.of(
                    MessagingErrorCode.UNREGISTERED,
                    MessagingErrorCode.INVALID_ARGUMENT,
                    MessagingErrorCode.SENDER_ID_MISMATCH);

    private static final Logger log = LoggerFactory.getLogger(FcmPushProvider.class);

    private final Sender sender;

    /** Production constructor: sends through the Firebase Admin SDK. */
    public FcmPushProvider(FirebaseMessaging messaging) {
        this(tokensAndMessage -> sendEach(messaging, tokensAndMessage));
    }

    /** Test seam: the multicast call is replaced. */
    FcmPushProvider(Sender sender) {
        this.sender = sender;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public PushResult send(PushMessage message, List<String> tokens) {
        int delivered = 0;
        int failed = 0;
        List<String> invalid = new ArrayList<>();
        for (int from = 0; from < tokens.size(); from += MAX_TOKENS_PER_REQUEST) {
            List<String> batch =
                    tokens.subList(from, Math.min(tokens.size(), from + MAX_TOKENS_PER_REQUEST));
            List<TokenOutcome> outcomes;
            try {
                outcomes = sender.send(new Batch(batch, message));
            } catch (Exception e) {
                log.warn(
                        "FCM multicast failed for notification {} ({} devices): {}",
                        message.notificationId(),
                        batch.size(),
                        e.getMessage());
                failed += batch.size();
                continue;
            }
            for (int index = 0; index < batch.size(); index++) {
                @Nullable TokenOutcome outcome =
                        index < outcomes.size() ? outcomes.get(index) : null;
                if (outcome != null && outcome.success()) {
                    delivered++;
                    continue;
                }
                failed++;
                if (outcome != null
                        && outcome.errorCode() != null
                        && INVALID_TOKEN_CODES.contains(outcome.errorCode())) {
                    invalid.add(batch.get(index));
                }
            }
        }
        if (failed > 0) {
            log.info(
                    "FCM notification {}: {} delivered, {} failed, {} invalid tokens",
                    message.notificationId(),
                    delivered,
                    failed,
                    invalid.size());
        }
        return new PushResult(delivered, failed, invalid);
    }

    // Registration tokens: the SDK now prefers Firebase installation ids (addAllFids), but device
    // registration tokens remain the targets mobile clients register.
    @SuppressWarnings("deprecation")
    private static List<TokenOutcome> sendEach(FirebaseMessaging messaging, Batch batch)
            throws FirebaseMessagingException {
        PushMessage message = batch.message();
        MulticastMessage multicast =
                MulticastMessage.builder()
                        .addAllTokens(batch.tokens())
                        .setNotification(
                                Notification.builder()
                                        .setTitle(message.title())
                                        .setBody(message.body())
                                        .build())
                        .putAllData(message.data())
                        .setAndroidConfig(
                                AndroidConfig.builder()
                                        .setPriority(AndroidConfig.Priority.HIGH)
                                        .setCollapseKey(message.type().name())
                                        .build())
                        .build();
        BatchResponse response = messaging.sendEachForMulticast(multicast);
        List<TokenOutcome> outcomes = new ArrayList<>();
        for (SendResponse single : response.getResponses()) {
            @Nullable FirebaseMessagingException error = single.getException();
            outcomes.add(
                    new TokenOutcome(
                            single.isSuccessful(),
                            error == null ? null : error.getMessagingErrorCode()));
        }
        return outcomes;
    }

    /** One multicast call: tokens (at most 500) and the message. */
    record Batch(List<String> tokens, PushMessage message) {}

    /**
     * Result for one token, in the order of the batch.
     *
     * @param success accepted by FCM
     * @param errorCode FCM error code of a failure, if any
     */
    record TokenOutcome(boolean success, @Nullable MessagingErrorCode errorCode) {}

    /** The multicast call. */
    @FunctionalInterface
    interface Sender {
        List<TokenOutcome> send(Batch batch) throws Exception;
    }
}
