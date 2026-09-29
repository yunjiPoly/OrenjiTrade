package com.orenjitrade.api.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.TestAuthConfiguration;
import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.config.OrenjiSecurityProperties;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/** {@code /internal/**}: service token or (fake) Google OIDC identity. */
class ServiceAuthIT extends AbstractIntegrationTest {

    private static final String ALLOWED_INVOKER =
            "scheduler@orenjitrade-test.iam.gserviceaccount.com";

    @Test
    void withoutCredentialsIsUnauthenticatedProblem() {
        http.post()
                .uri("/internal/jobs/ping")
                .exchange()
                .expectStatus()
                .isUnauthorized()
                .expectHeader()
                .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("UNAUTHENTICATED");
    }

    @Test
    void serviceTokenIsAccepted() {
        http.post()
                .uri("/internal/jobs/ping")
                .header(
                        ServiceAuthFilter.SERVICE_TOKEN_HEADER,
                        OrenjiSecurityProperties.DEFAULT_SERVICE_TOKEN)
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.ok")
                .isEqualTo(true);

        List<Map<String, Object>> runs = testUsers.jobRuns("ping");
        assertThat(runs).isNotEmpty();
        assertThat(runs.get(0).get("status")).isEqualTo("SUCCEEDED");
        assertThat(String.valueOf(runs.get(0).get("details"))).contains("pingedAt");
    }

    @Test
    void wrongServiceTokenIsRejected() {
        http.post()
                .uri("/internal/jobs/ping")
                .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, "nope")
                .exchange()
                .expectStatus()
                .isUnauthorized()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("UNAUTHENTICATED");
    }

    @Test
    void oidcTokenOfAllowedInvokerIsAccepted() {
        http.post()
                .uri("/internal/jobs/ping")
                .header(
                        HttpHeaders.AUTHORIZATION,
                        "Bearer " + TestAuthConfiguration.OIDC_TOKEN_PREFIX + ALLOWED_INVOKER)
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.ok")
                .isEqualTo(true);
    }

    @Test
    void oidcTokenOfUnknownInvokerIsRejected() {
        http.post()
                .uri("/internal/jobs/ping")
                .header(
                        HttpHeaders.AUTHORIZATION,
                        "Bearer "
                                + TestAuthConfiguration.OIDC_TOKEN_PREFIX
                                + "stranger@example.com")
                .exchange()
                .expectStatus()
                .isUnauthorized();

        http.post()
                .uri("/internal/jobs/ping")
                .header(HttpHeaders.AUTHORIZATION, "Bearer not-an-oidc-token")
                .exchange()
                .expectStatus()
                .isUnauthorized();
    }

    @Test
    void collectorTokensDoNotOpenInternalRoutes() {
        String uid = uniqueUid("internal-user");
        provisionCompliant(uid);

        http.post()
                .uri("/internal/jobs/ping")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isUnauthorized();
    }

    @Test
    void serviceTokenDoesNotOpenCollectorRoutes() {
        http.get()
                .uri("/api/v1/me")
                .header(
                        ServiceAuthFilter.SERVICE_TOKEN_HEADER,
                        OrenjiSecurityProperties.DEFAULT_SERVICE_TOKEN)
                .exchange()
                .expectStatus()
                .isUnauthorized();
    }
}
