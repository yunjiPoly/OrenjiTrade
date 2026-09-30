package com.orenjitrade.api.analytics.infra;

import com.orenjitrade.api.analytics.domain.ActorHasher;
import com.orenjitrade.api.analytics.domain.AnalyticsAggregate;
import com.orenjitrade.api.analytics.domain.AnalyticsPublisher;
import com.orenjitrade.api.analytics.domain.AnalyticsTransport;
import com.orenjitrade.api.config.AsyncConfig;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Executor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.json.JsonMapper;

/**
 * Wires the analytics publisher. The transport follows {@code EVENTS_TRANSPORT}: {@code local}
 * (default) logs events through {@link LogAnalyticsTransport}; only {@code pubsub} creates {@link
 * PubSubAnalyticsTransport}, so local development never needs Google Cloud. Also validates {@code
 * ANALYTICS_ACTOR_SALT} at start-up: outside the {@code local} and {@code test} profiles the
 * application refuses to start when it is missing, the development default or shorter than {@value
 * #MIN_SALT_LENGTH} characters (a known salt would let anyone re-identify actor hashes).
 */
@Configuration(proxyBeanMethods = false)
public class AnalyticsConfig {

    static final int MIN_SALT_LENGTH = 32;
    static final Set<String> DEVELOPMENT_PROFILES = Set.of("local", "test");

    @Bean
    ActorHasher analyticsActorHasher(AnalyticsProperties properties, Environment environment) {
        validateSalt(properties.actorSalt(), environment.getActiveProfiles());
        return new ActorHasher(properties.actorSalt());
    }

    @Bean
    AnalyticsTransport analyticsTransport(
            EventTransportProperties events,
            @Value("${orenji.google-cloud.project:}") String googleCloudProject,
            JsonMapper jsonMapper) {
        return transportFor(events, googleCloudProject, jsonMapper);
    }

    @Bean
    AnalyticsAggregate analyticsAggregate(JdbcClient jdbc) {
        return new JdbcAnalyticsAggregate(jdbc);
    }

    @Bean
    AnalyticsPublisher analyticsPublisher(
            AnalyticsTransport transport,
            @Qualifier(AsyncConfig.APPLICATION_TASK_EXECUTOR) Executor executor,
            ActorHasher actorHasher,
            AnalyticsAggregate aggregate) {
        return new AnalyticsPublisher(transport, executor, actorHasher, aggregate);
    }

    /** The transport selected by {@code orenji.events.transport}. */
    static AnalyticsTransport transportFor(
            EventTransportProperties events, String googleCloudProject, JsonMapper jsonMapper) {
        String transport = events.transport().trim().toLowerCase(Locale.ROOT);
        return switch (transport) {
            case EventTransportProperties.LOCAL -> new LogAnalyticsTransport(jsonMapper);
            case EventTransportProperties.PUBSUB ->
                    new PubSubAnalyticsTransport(
                            googleCloudProject,
                            events.pubsub().topicAnalytics(),
                            events.pubsub().emulatorHost(),
                            jsonMapper);
            default ->
                    throw new IllegalStateException(
                            "Unsupported EVENTS_TRANSPORT '" + transport + "' (local or pubsub)");
        };
    }

    /**
     * @throws IllegalStateException when the salt is unusable for the active profiles
     */
    static void validateSalt(String salt, String[] activeProfiles) {
        boolean development =
                activeProfiles.length == 0
                        || Arrays.stream(activeProfiles).anyMatch(DEVELOPMENT_PROFILES::contains);
        if (salt == null || salt.isBlank()) {
            throw new IllegalStateException(
                    "ANALYTICS_ACTOR_SALT (orenji.analytics.actor-salt) must be set");
        }
        if (development) {
            return;
        }
        if (AnalyticsProperties.DEVELOPMENT_SALT.equals(salt)) {
            throw new IllegalStateException(
                    "ANALYTICS_ACTOR_SALT must not be the development default in this profile");
        }
        if (salt.length() < MIN_SALT_LENGTH) {
            throw new IllegalStateException(
                    "ANALYTICS_ACTOR_SALT must be at least "
                            + MIN_SALT_LENGTH
                            + " characters long");
        }
    }
}
