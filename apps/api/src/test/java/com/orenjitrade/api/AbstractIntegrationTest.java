package com.orenjitrade.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.auth.infra.StaticIdentityTokenVerifier;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import org.springframework.test.web.servlet.client.RestTestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.MissingNode;

/**
 * Base class for integration tests: boots the whole application on a random port with the {@code
 * test} profile against the PostGIS and Redis containers of {@link TestcontainersConfiguration}.
 * Spring caches the application context across subclasses, so the whole suite starts one
 * application and one pair of containers (tests that override properties get their own context but
 * still share the containers). Docker is required.
 *
 * <p>Authentication uses {@link StaticIdentityTokenVerifier} tokens ({@code test-token:<uid>}). Use
 * {@link #uniqueUid(String)} so tests never share accounts, whatever the execution order.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import({
    TestcontainersConfiguration.class,
    TestAuthConfiguration.class,
    TestDeletionConfiguration.class
})
public abstract class AbstractIntegrationTest {

    /**
     * Client bound to the running server (random port). Built on the JDK {@link
     * java.net.http.HttpClient} rather than Boot's auto-configured Apache HttpClient, whose default
     * retry strategy honours {@code Retry-After} on 429 responses and would sleep for the whole
     * rate-limit window instead of handing the response to the test.
     */
    protected RestTestClient http;

    @Autowired protected JsonMapper jsonMapper;

    @Autowired protected TestUsers testUsers;

    @LocalServerPort private int port;

    @BeforeEach
    void bindClientToServer() {
        http =
                RestTestClient.bindToServer(new JdkClientHttpRequestFactory())
                        .baseUrl("http://localhost:" + port)
                        .build();
    }

    /** A provider uid that no other test uses ({@code <prefix>-<random>}). */
    protected static String uniqueUid(String prefix) {
        return prefix
                + "-"
                + Long.toHexString(ThreadLocalRandom.current().nextLong() & 0xffffffffL);
    }

    /** {@code Authorization} header value for a test token. */
    protected static String bearer(String uid, String... flags) {
        return "Bearer " + StaticIdentityTokenVerifier.token(uid, flags);
    }

    /** Calls {@code GET /api/v1/me} (which provisions the account) and returns the parsed body. */
    protected JsonNode me(String uid, String... flags) {
        EntityExchangeResult<byte[]> result =
                http.get()
                        .uri("/api/v1/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(uid, flags))
                        .exchange()
                        .expectStatus()
                        .isOk()
                        .expectBody()
                        .returnResult();
        byte[] body = result.getResponseBody();
        assertThat(body).isNotNull();
        return jsonMapper.readTree(body);
    }

    /** Provisions an account through the API and returns its id. */
    protected UUID provision(String uid) {
        return UUID.fromString(me(uid).path("id").asString());
    }

    /** Provisions an account that has accepted every required document. */
    protected UUID provisionCompliant(String uid) {
        UUID id = provision(uid);
        testUsers.acceptAllRequiredConsents(id);
        return id;
    }

    /** Sends a request (JSON body when given) and returns the raw result, whatever the status. */
    protected EntityExchangeResult<byte[]> call(
            HttpMethod method, String uri, @Nullable String uid, @Nullable Object body) {
        RestTestClient.RequestBodySpec spec = http.method(method).uri(uri);
        if (uid != null) {
            spec = spec.header(HttpHeaders.AUTHORIZATION, bearer(uid));
        }
        RestTestClient.RequestHeadersSpec<?> ready =
                body == null ? spec : spec.contentType(MediaType.APPLICATION_JSON).body(body);
        return ready.exchange().expectBody().returnResult();
    }

    /**
     * Like {@link #call} but asserts the status (the body is part of the failure message) and
     * parses the JSON body ({@code MissingNode} when empty).
     */
    protected JsonNode callJson(
            HttpMethod method,
            String uri,
            @Nullable String uid,
            @Nullable Object body,
            int expectedStatus) {
        EntityExchangeResult<byte[]> result = call(method, uri, uid, body);
        byte[] bytes = result.getResponseBody();
        String text = bytes == null ? "" : new String(bytes, StandardCharsets.UTF_8);
        assertThat(result.getStatus().value())
                .as("%s %s -> %s", method, uri, text)
                .isEqualTo(expectedStatus);
        return text.isEmpty() ? MissingNode.getInstance() : jsonMapper.readTree(text);
    }

    /** Parses a response body. */
    protected JsonNode json(EntityExchangeResult<byte[]> result) {
        byte[] body = result.getResponseBody();
        assertThat(body).isNotNull();
        return jsonMapper.readTree(body);
    }

    /** Provisions a compliant account holding the given roles (USER is always present). */
    protected UUID provisionWithRoles(String uid, Role... roles) {
        UUID id = provisionCompliant(uid);
        testUsers.grantRoles(id, roles);
        return id;
    }
}
