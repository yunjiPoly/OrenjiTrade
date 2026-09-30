package com.orenjitrade.api.analytics.infra;

import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;
import com.orenjitrade.api.analytics.domain.AnalyticsEvent;
import com.orenjitrade.api.analytics.domain.AnalyticsTransport;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.json.JsonMapper;

/**
 * Cloud transport ({@code EVENTS_TRANSPORT=pubsub} only; never selected locally): publishes each
 * event to the Pub/Sub topic {@code analytics-events} through the Pub/Sub REST API ({@code
 * projects/<project>/topics/<topic>:publish}) with Application Default Credentials (the Cloud Run
 * service account), or to a Pub/Sub emulator without credentials when {@code PUBSUB_EMULATOR_HOST}
 * is set. A BigQuery subscription writes the messages into {@code orenjitrade_analytics.events}
 * (Terraform module {@code bigquery}). Uses the JDK HTTP client and the Google auth library already
 * on the classpath (ADR 0013: client libraries, no Spring Cloud GCP); nothing is contacted until
 * the first event.
 */
public class PubSubAnalyticsTransport implements AnalyticsTransport {

    static final String SCOPE = "https://www.googleapis.com/auth/pubsub";
    static final String CLOUD_ENDPOINT = "https://pubsub.googleapis.com";

    private final URI publishUri;
    private final boolean emulator;
    private final JsonMapper jsonMapper;
    private final HttpClient http;
    private volatile @Nullable GoogleCredentials credentials;

    public PubSubAnalyticsTransport(
            String projectId, String topic, String emulatorHost, JsonMapper jsonMapper) {
        if (projectId.isBlank()) {
            throw new IllegalStateException(
                    "GOOGLE_CLOUD_PROJECT (orenji.google-cloud.project) must be set when"
                            + " EVENTS_TRANSPORT=pubsub");
        }
        if (topic.isBlank()) {
            throw new IllegalStateException(
                    "PUBSUB_TOPIC_ANALYTICS (orenji.events.pubsub.topic-analytics) must be set");
        }
        this.emulator = !emulatorHost.isBlank();
        String endpoint = emulator ? "http://" + emulatorHost.trim() : CLOUD_ENDPOINT;
        this.publishUri =
                URI.create(
                        endpoint
                                + "/v1/projects/"
                                + projectId.trim()
                                + "/topics/"
                                + topic.trim()
                                + ":publish");
        this.jsonMapper = jsonMapper;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    }

    @Override
    public String name() {
        return "pubsub";
    }

    /** The REST endpoint messages are published to. */
    URI publishUri() {
        return publishUri;
    }

    @Override
    public void send(AnalyticsEvent event) {
        String data =
                Base64.getEncoder()
                        .encodeToString(
                                jsonMapper
                                        .writeValueAsString(event)
                                        .getBytes(StandardCharsets.UTF_8));
        Map<String, Object> body =
                Map.of(
                        "messages",
                        List.of(
                                Map.of(
                                        "data",
                                        data,
                                        "attributes",
                                        Map.of(
                                                "event_type",
                                                event.type(),
                                                "event_version",
                                                Integer.toString(event.version())))));
        HttpRequest.Builder request =
                HttpRequest.newBuilder(publishUri)
                        .timeout(Duration.ofSeconds(10))
                        .header("Content-Type", "application/json")
                        .POST(
                                HttpRequest.BodyPublishers.ofString(
                                        jsonMapper.writeValueAsString(body)));
        if (!emulator) {
            request.header("Authorization", "Bearer " + accessToken());
        }
        try {
            HttpResponse<Void> response =
                    http.send(request.build(), HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() / 100 != 2) {
                throw new IllegalStateException(
                        "Pub/Sub publish failed with HTTP " + response.statusCode());
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Pub/Sub publish failed", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Pub/Sub publish interrupted", e);
        }
    }

    private String accessToken() {
        try {
            GoogleCredentials current = credentials;
            if (current == null) {
                current = GoogleCredentials.getApplicationDefault().createScoped(List.of(SCOPE));
                credentials = current;
            }
            current.refreshIfExpired();
            AccessToken token = current.getAccessToken();
            if (token == null) {
                throw new IllegalStateException("No access token for Pub/Sub");
            }
            return token.getTokenValue();
        } catch (IOException e) {
            throw new UncheckedIOException("Application Default Credentials unavailable", e);
        }
    }
}
