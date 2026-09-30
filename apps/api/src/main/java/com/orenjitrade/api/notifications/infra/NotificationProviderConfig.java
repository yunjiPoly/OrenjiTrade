package com.orenjitrade.api.notifications.infra;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import com.orenjitrade.api.notifications.domain.EmailProvider;
import com.orenjitrade.api.notifications.domain.PushProvider;
import java.util.Locale;
import java.util.function.Supplier;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Selects the push and email providers from {@code PUSH_PROVIDER} ({@code orenji.push.provider}:
 * {@code log} by default, {@code fcm} in the cloud) and {@code EMAIL_PROVIDER} ({@code
 * orenji.email.provider}: {@code log}; {@code sendgrid} / {@code ses} adapters are deferred and
 * refused at start-up). Only {@code fcm} touches Firebase (the Admin SDK app of the auth module);
 * local development never needs credentials.
 */
@Configuration(proxyBeanMethods = false)
public class NotificationProviderConfig {

    private static final Logger log = LoggerFactory.getLogger(NotificationProviderConfig.class);

    @Bean
    PushProvider pushProvider(
            @Value("${orenji.push.provider:log}") String provider,
            ObjectProvider<FirebaseApp> firebaseApp) {
        PushProvider selected =
                pushProviderFor(
                        provider,
                        () -> {
                            @Nullable FirebaseApp app = firebaseApp.getIfAvailable();
                            if (app == null) {
                                throw new IllegalStateException(
                                        "PUSH_PROVIDER=fcm needs the Firebase Admin SDK"
                                                + " (not available under this profile)");
                            }
                            return FirebaseMessaging.getInstance(app);
                        });
        log.info("Push provider: {}", selected.name());
        return selected;
    }

    @Bean
    EmailProvider emailProvider(
            @Value("${orenji.email.provider:log}") String provider,
            @Value("${orenji.email.from:no-reply@orenjitrade.com}") String from) {
        EmailProvider selected = emailProviderFor(provider, from);
        log.info("Email provider: {}", selected.name());
        return selected;
    }

    /** The push provider named by {@code PUSH_PROVIDER}. */
    static PushProvider pushProviderFor(String provider, Supplier<FirebaseMessaging> messaging) {
        String name = provider.trim().toLowerCase(Locale.ROOT);
        return switch (name) {
            case "", LogPushProvider.NAME -> new LogPushProvider();
            case FcmPushProvider.NAME -> new FcmPushProvider(messaging.get());
            default ->
                    throw new IllegalStateException(
                            "Unsupported PUSH_PROVIDER '" + provider + "' (log or fcm)");
        };
    }

    /** The email provider named by {@code EMAIL_PROVIDER}. */
    static EmailProvider emailProviderFor(String provider, String from) {
        String name = provider.trim().toLowerCase(Locale.ROOT);
        return switch (name) {
            case "", LogEmailProvider.NAME -> new LogEmailProvider(from);
            default ->
                    throw new IllegalStateException(
                            "Unsupported EMAIL_PROVIDER '"
                                    + provider
                                    + "' (only log is implemented; sendgrid and ses adapters are"
                                    + " deferred)");
        };
    }
}
