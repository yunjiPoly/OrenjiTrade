package com.orenjitrade.api.analytics.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.analytics.domain.AnalyticsTransport;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * Transport selection ({@code EVENTS_TRANSPORT}: the log transport by default, Pub/Sub only when
 * asked for, nothing contacted at construction) and the {@code ANALYTICS_ACTOR_SALT} start-up
 * guard.
 */
class AnalyticsConfigTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static EventTransportProperties events(String transport, String emulatorHost) {
        return new EventTransportProperties(
                transport,
                new EventTransportProperties.PubSub(
                        emulatorHost, "domain-events", "analytics-events"));
    }

    @Test
    void localTransportLogsEvents() {
        AnalyticsTransport transport = AnalyticsConfig.transportFor(events("local", ""), "", JSON);
        assertThat(transport).isInstanceOf(LogAnalyticsTransport.class);
        assertThat(transport.name()).isEqualTo("log");
    }

    @Test
    void pubSubTransportOnlyWhenSelectedAndConfigured() {
        AnalyticsTransport cloud =
                AnalyticsConfig.transportFor(events("pubsub", ""), "orenjitrade-prod", JSON);
        assertThat(cloud).isInstanceOf(PubSubAnalyticsTransport.class);
        assertThat(((PubSubAnalyticsTransport) cloud).publishUri().toString())
                .isEqualTo(
                        "https://pubsub.googleapis.com/v1/projects/orenjitrade-prod/topics/"
                                + "analytics-events:publish");
        AnalyticsTransport emulator =
                AnalyticsConfig.transportFor(
                        events("PUBSUB", "localhost:8085"), "orenjitrade-local", JSON);
        assertThat(((PubSubAnalyticsTransport) emulator).publishUri().toString())
                .startsWith("http://localhost:8085/v1/projects/orenjitrade-local/");
        assertThatThrownBy(() -> AnalyticsConfig.transportFor(events("pubsub", ""), " ", JSON))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("GOOGLE_CLOUD_PROJECT");
        assertThatThrownBy(() -> AnalyticsConfig.transportFor(events("kafka", ""), "p", JSON))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void saltGuard() {
        String strong = "0123456789abcdef0123456789abcdef";
        assertThatNoException()
                .isThrownBy(
                        () ->
                                AnalyticsConfig.validateSalt(
                                        AnalyticsProperties.DEVELOPMENT_SALT,
                                        new String[] {"local"}));
        assertThatNoException()
                .isThrownBy(() -> AnalyticsConfig.validateSalt("short", new String[] {"test"}));
        assertThatNoException()
                .isThrownBy(() -> AnalyticsConfig.validateSalt(strong, new String[] {"prod"}));
        assertThatThrownBy(() -> AnalyticsConfig.validateSalt("", new String[] {"local"}))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(
                        () ->
                                AnalyticsConfig.validateSalt(
                                        AnalyticsProperties.DEVELOPMENT_SALT,
                                        new String[] {"staging"}))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> AnalyticsConfig.validateSalt("short", new String[] {"dev"}))
                .isInstanceOf(IllegalStateException.class);
    }
}
