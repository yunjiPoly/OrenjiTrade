package com.orenjitrade.api.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.function.Predicate;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import org.springframework.test.web.servlet.client.RestTestClient;
import tools.jackson.databind.JsonNode;

/**
 * Helpers of the Phase 10 integration tests (subscriptions, credits, ads, donations): fresh members
 * and staff, feature flags (restored to the V010 defaults after each test), raw webhooks, internal
 * jobs and polling of asynchronously applied webhooks.
 */
public abstract class AbstractPhase10IT extends AbstractIntegrationTest {

    public static final String SERVICE_TOKEN = "local-service-token";
    public static final Duration WAIT = Duration.ofSeconds(20);

    @Autowired protected FeatureFlags featureFlags;

    /** A member: token uid and account id. */
    public record Member(String uid, UUID id) {}

    @AfterEach
    void restoreFlagDefaults() {
        flag("premiumPlans", true);
        flag("credits", true);
        flag("advertising", false);
        flag("donations", false);
    }

    /** A compliant member. */
    protected Member member(String prefix) {
        String uid = uniqueUid(prefix);
        return new Member(uid, provisionCompliant(uid));
    }

    /** A compliant account holding {@code role}; returns its token uid. */
    protected String staff(String prefix, Role role) {
        String uid = uniqueUid(prefix);
        provisionWithRoles(uid, role);
        return uid;
    }

    /** Switches a flag for everybody (callers rely on the restore after each test). */
    protected void flag(String key, boolean enabled) {
        testUsers.update(
                "UPDATE feature_flag SET enabled = ?, rollout_percent = 100 WHERE key = ?",
                enabled,
                key);
        featureFlags.invalidate();
    }

    /** Posts a raw webhook body with the given headers (no bearer token). */
    protected EntityExchangeResult<byte[]> postWebhook(
            String path, String payload, Map<String, String> headers) {
        RestTestClient.RequestBodySpec spec =
                http.post().uri(path).contentType(MediaType.APPLICATION_JSON);
        for (Map.Entry<String, String> header : headers.entrySet()) {
            spec = spec.header(header.getKey(), header.getValue());
        }
        return spec.body(payload.getBytes(StandardCharsets.UTF_8))
                .exchange()
                .expectBody()
                .returnResult();
    }

    /** Runs an internal job with the service token and returns its JSON answer. */
    protected JsonNode job(String path) {
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri(path)
                        .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
                        .exchange()
                        .expectBody()
                        .returnResult();
        assertThat(result.getStatus().value()).as("job %s", path).isEqualTo(200);
        return json(result);
    }

    /** Polls {@code GET path} as {@code uid} until {@code condition} holds; returns the body. */
    protected JsonNode awaitJson(String path, @Nullable String uid, Predicate<JsonNode> condition) {
        JsonNode[] last = new JsonNode[1];
        await().atMost(WAIT)
                .pollInterval(Duration.ofMillis(200))
                .alias("GET " + path)
                .until(
                        () -> {
                            last[0] = callJson(HttpMethod.GET, path, uid, null, 200);
                            return condition.test(last[0]);
                        });
        return last[0];
    }

    /** The problem's error code. */
    protected static String errorCode(JsonNode problem) {
        return problem.path("errorCode").asString();
    }
}
