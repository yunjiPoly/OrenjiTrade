package com.orenjitrade.api.notifications.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.google.firebase.messaging.MessagingErrorCode;
import com.orenjitrade.api.notifications.domain.EmailProvider;
import com.orenjitrade.api.notifications.domain.EmailProvider.EmailMessage;
import com.orenjitrade.api.notifications.domain.NotificationType;
import com.orenjitrade.api.notifications.domain.PushProvider;
import com.orenjitrade.api.notifications.domain.PushProvider.PushMessage;
import com.orenjitrade.api.notifications.domain.PushProvider.PushResult;
import com.orenjitrade.api.notifications.infra.FcmPushProvider.Batch;
import com.orenjitrade.api.notifications.infra.FcmPushProvider.TokenOutcome;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

/**
 * Push and email providers (Phase 6 contract): the log providers are the defaults and never write
 * device tokens or email addresses to the logs; the FCM adapter is selected only by {@code
 * PUSH_PROVIDER=fcm} (Firebase is not touched otherwise), sends multicasts of at most 500 tokens,
 * reports the tokens FCM declares invalid and never throws; unknown providers stop the start-up.
 */
@ExtendWith(OutputCaptureExtension.class)
class PushAndEmailProvidersTest {

    private static final PushMessage MESSAGE =
            new PushMessage(
                    UUID.fromString("00000000-0000-4000-9a00-00000000abcd"),
                    UUID.fromString("00000000-0000-4000-8000-000000000002"),
                    NotificationType.WISHLIST_ALERT,
                    "Wishlist alert: Azure-Eyes Sky Dragon",
                    "Azure-Eyes Sky Dragon AZR-EN001 Ultra Rare was just listed by @collector1 in"
                            + " Quebec, Canada.",
                    Map.of("deepLink", "/cards/x", "type", "WISHLIST_ALERT"));

    @Test
    void logPushProviderLogsWithoutTokensAndDeliversEverything(CapturedOutput output) {
        PushProvider provider = new LogPushProvider();
        String secretToken = "device-token-" + UUID.randomUUID();
        PushResult result = provider.send(MESSAGE, List.of(secretToken, "second-device-token"));
        assertThat(provider.name()).isEqualTo("log");
        assertThat(result.delivered()).isEqualTo(2);
        assertThat(result.failed()).isZero();
        assertThat(result.invalidTokens()).isEmpty();
        assertThat(output.getAll())
                .contains("push (log provider)")
                .contains("devices=2")
                .contains(MESSAGE.notificationId().toString())
                .doesNotContain(secretToken)
                .doesNotContain("second-device-token");
    }

    @Test
    void logEmailProviderMasksTheAddress(CapturedOutput output) {
        EmailProvider provider = new LogEmailProvider("no-reply@orenjitrade.com");
        boolean sent =
                provider.send(
                        new EmailMessage(
                                MESSAGE.notificationId(),
                                NotificationType.MESSAGE,
                                "collector1@orenjitrade.test",
                                "New message from Devon Okafor",
                                "Devon Okafor sent you a message."));
        assertThat(provider.name()).isEqualTo("log");
        assertThat(sent).isTrue();
        assertThat(output.getAll())
                .contains("email (log provider)")
                .contains("to=c***@orenjitrade.test")
                .doesNotContain("collector1@orenjitrade.test");
        assertThat(LogEmailProvider.mask("Alice@example.org")).isEqualTo("a***@example.org");
        assertThat(LogEmailProvider.mask("no-at-sign")).isEqualTo("***");
        assertThat(LogEmailProvider.mask("@example.org")).isEqualTo("***");
    }

    @Test
    void fcmBatchesAtMost500TokensAndReportsInvalidOnes() {
        List<Batch> batches = new ArrayList<>();
        List<String> tokens = new ArrayList<>();
        for (int i = 0; i < 1203; i++) {
            tokens.add("token-" + i);
        }
        FcmPushProvider provider =
                new FcmPushProvider(
                        batch -> {
                            batches.add(batch);
                            List<TokenOutcome> outcomes = new ArrayList<>();
                            for (String token : batch.tokens()) {
                                outcomes.add(
                                        switch (token) {
                                            case "token-7" ->
                                                    new TokenOutcome(
                                                            false, MessagingErrorCode.UNREGISTERED);
                                            case "token-600" ->
                                                    new TokenOutcome(
                                                            false,
                                                            MessagingErrorCode.INVALID_ARGUMENT);
                                            case "token-1100" ->
                                                    new TokenOutcome(
                                                            false,
                                                            MessagingErrorCode.SENDER_ID_MISMATCH);
                                            case "token-9" ->
                                                    new TokenOutcome(
                                                            false, MessagingErrorCode.UNAVAILABLE);
                                            default -> new TokenOutcome(true, null);
                                        });
                            }
                            return outcomes;
                        });

        PushResult result = provider.send(MESSAGE, tokens);

        assertThat(provider.name()).isEqualTo("fcm");
        assertThat(batches)
                .extracting(batch -> batch.tokens().size())
                .containsExactly(500, 500, 203);
        assertThat(batches).allMatch(batch -> batch.message().equals(MESSAGE));
        assertThat(result.delivered()).isEqualTo(1199);
        assertThat(result.failed()).isEqualTo(4);
        assertThat(result.invalidTokens())
                .as("transient errors keep their token")
                .containsExactly("token-7", "token-600", "token-1100");
    }

    @Test
    void fcmFailuresAreReportedNeverThrown() {
        AtomicBoolean first = new AtomicBoolean(true);
        List<String> tokens = new ArrayList<>();
        for (int i = 0; i < 510; i++) {
            tokens.add("t" + i);
        }
        FcmPushProvider provider =
                new FcmPushProvider(
                        batch -> {
                            if (first.getAndSet(false)) {
                                throw new IllegalStateException("FCM unavailable");
                            }
                            // Fewer outcomes than tokens: the missing ones count as failed.
                            return List.of(new TokenOutcome(true, null));
                        });
        PushResult result = provider.send(MESSAGE, tokens);
        assertThat(result.delivered()).isEqualTo(1);
        assertThat(result.failed()).isEqualTo(509);
        assertThat(result.invalidTokens()).isEmpty();
    }

    @Test
    void providersAreSelectedByConfiguration() {
        AtomicBoolean firebaseTouched = new AtomicBoolean(false);
        PushProvider log =
                NotificationProviderConfig.pushProviderFor(
                        "log",
                        () -> {
                            firebaseTouched.set(true);
                            throw new IllegalStateException("not configured");
                        });
        assertThat(log).isInstanceOf(LogPushProvider.class);
        assertThat(NotificationProviderConfig.pushProviderFor(" ", () -> null))
                .isInstanceOf(LogPushProvider.class);
        assertThat(firebaseTouched).as("the log provider never touches Firebase").isFalse();

        assertThatThrownBy(
                        () ->
                                NotificationProviderConfig.pushProviderFor(
                                        "FCM",
                                        () -> {
                                            firebaseTouched.set(true);
                                            throw new IllegalStateException(
                                                    "PUSH_PROVIDER=fcm needs the Firebase Admin"
                                                            + " SDK");
                                        }))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Firebase");
        assertThat(firebaseTouched).as("fcm asks for the Firebase messaging client").isTrue();
        assertThatThrownBy(() -> NotificationProviderConfig.pushProviderFor("apns", () -> null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Unsupported PUSH_PROVIDER");

        assertThat(NotificationProviderConfig.emailProviderFor("LOG", "from@orenjitrade.com"))
                .isInstanceOf(LogEmailProvider.class);
        assertThat(NotificationProviderConfig.emailProviderFor("", "from@orenjitrade.com"))
                .isInstanceOf(LogEmailProvider.class);
        assertThatThrownBy(
                        () ->
                                NotificationProviderConfig.emailProviderFor(
                                        "sendgrid", "from@orenjitrade.com"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Unsupported EMAIL_PROVIDER");
    }
}
