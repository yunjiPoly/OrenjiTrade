package com.orenjitrade.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.common.RequestIdFilter;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/** End-to-end shape of RFC 9457 problem responses, including the ones written by Spring Security. */
class ProblemDetailsIT extends AbstractIntegrationTest {

    @Test
    void unknownPublicRouteIsNotFoundProblem() {
        http.get()
                .uri("/api/v1/public/does-not-exist")
                .header(RequestIdFilter.HEADER, "it-not-found-1")
                .exchange()
                .expectStatus()
                .isNotFound()
                .expectHeader()
                .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectHeader()
                .valueEquals(RequestIdFilter.HEADER, "it-not-found-1")
                .expectBody()
                .jsonPath("$.status")
                .isEqualTo(404)
                .jsonPath("$.errorCode")
                .isEqualTo("NOT_FOUND")
                .jsonPath("$.title")
                .isEqualTo("Not found")
                .jsonPath("$.type")
                .isEqualTo("https://api.orenjitrade.com/problems/not-found")
                .jsonPath("$.instance")
                .isEqualTo("/api/v1/public/does-not-exist")
                .jsonPath("$.message")
                .isNotEmpty()
                .jsonPath("$.requestId")
                .isEqualTo("it-not-found-1")
                .jsonPath("$.timestamp")
                .value(String.class, value -> assertThat(Instant.parse(value)).isNotNull())
                .jsonPath("$.errors")
                .doesNotExist();
    }

    @Test
    void protectedRouteWithoutTokenIsUnauthenticatedProblem() {
        http.get()
                .uri("/api/v1/me")
                .header(RequestIdFilter.HEADER, "it-unauth-1")
                .exchange()
                .expectStatus()
                .isUnauthorized()
                .expectHeader()
                .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectHeader()
                .valueEquals(RequestIdFilter.HEADER, "it-unauth-1")
                .expectHeader()
                .value(
                        HttpHeaders.WWW_AUTHENTICATE,
                        value -> assertThat(value).startsWith("Bearer"))
                .expectBody()
                .jsonPath("$.status")
                .isEqualTo(401)
                .jsonPath("$.errorCode")
                .isEqualTo("UNAUTHENTICATED")
                .jsonPath("$.instance")
                .isEqualTo("/api/v1/me")
                .jsonPath("$.requestId")
                .isEqualTo("it-unauth-1")
                .jsonPath("$.timestamp")
                .isNotEmpty()
                .jsonPath("$.message")
                .isNotEmpty();
    }

    @Test
    void protectedActuatorEndpointRequiresAuthentication() {
        http.get()
                .uri("/actuator/metrics")
                .exchange()
                .expectStatus()
                .isUnauthorized()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("UNAUTHENTICATED");
    }

    @Test
    void securityHeadersArePresentAndHstsIsDisabledInTestProfile() {
        http.get()
                .uri("/api/v1/meta")
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .doesNotExist("Strict-Transport-Security")
                .expectHeader()
                .valueEquals("X-Content-Type-Options", "nosniff")
                .expectHeader()
                .valueEquals("X-Frame-Options", "DENY")
                .expectHeader()
                .valueEquals("Referrer-Policy", "strict-origin-when-cross-origin")
                .expectHeader()
                .exists("Permissions-Policy")
                .expectHeader()
                .exists(HttpHeaders.CACHE_CONTROL);
    }
}
