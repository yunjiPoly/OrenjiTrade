package com.orenjitrade.api.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.ratelimit.RateLimitFilter;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

/**
 * Rate limiting with a tiny policy (3 per hour on {@code GET /api/v1/me}, per user) so the fourth
 * call is rejected. Separate context because the properties differ from the shared test profile.
 */
@TestPropertySource(
        properties = {
            "orenji.ratelimit.enabled=true",
            "orenji.ratelimit.policies[0].name=it-me",
            "orenji.ratelimit.policies[0].path-patterns[0]=/api/v1/me",
            "orenji.ratelimit.policies[0].methods[0]=GET",
            "orenji.ratelimit.policies[0].limit=3",
            "orenji.ratelimit.policies[0].window-seconds=3600",
            "orenji.ratelimit.policies[0].key-by=USER",
            "orenji.ratelimit.policies[1].name=it-anonymous",
            "orenji.ratelimit.policies[1].path-patterns[0]=/api/v1/public/**",
            "orenji.ratelimit.policies[1].limit=1000",
            "orenji.ratelimit.policies[1].window-seconds=3600",
            "orenji.ratelimit.policies[1].key-by=IP"
        })
class RateLimitIT extends AbstractIntegrationTest {

    @Test
    void fourthCallWithinWindowIsRateLimited() {
        String uid = uniqueUid("ratelimit");

        for (int call = 1; call <= 3; call++) {
            int expectedRemaining = 3 - call;
            http.get()
                    .uri("/api/v1/me")
                    .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                    .exchange()
                    .expectStatus()
                    .isOk()
                    .expectHeader()
                    .valueEquals(RateLimitFilter.HEADER_LIMIT, "3")
                    .expectHeader()
                    .valueEquals(
                            RateLimitFilter.HEADER_REMAINING, String.valueOf(expectedRemaining));
        }

        http.get()
                .uri("/api/v1/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isEqualTo(429)
                .expectHeader()
                .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectHeader()
                .valueEquals(RateLimitFilter.HEADER_LIMIT, "3")
                .expectHeader()
                .valueEquals(RateLimitFilter.HEADER_REMAINING, "0")
                .expectHeader()
                .value(
                        HttpHeaders.RETRY_AFTER,
                        value -> assertThat(Long.parseLong(value)).isBetween(1L, 3600L))
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("RATE_LIMITED")
                .jsonPath("$.status")
                .isEqualTo(429)
                .jsonPath("$.limit")
                .isEqualTo(3)
                .jsonPath("$.retryAfterSeconds")
                .isNumber();

        // Another user has an independent counter; another route is not covered by the policy.
        http.get()
                .uri("/api/v1/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(uniqueUid("ratelimit-other")))
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .valueEquals(RateLimitFilter.HEADER_REMAINING, "2");
        http.post()
                .uri("/api/v1/me/consents")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"documentType\":\"TERMS\",\"version\":\"2026-09-01\"}")
                .exchange()
                .expectStatus()
                .isNoContent()
                .expectHeader()
                .doesNotExist(RateLimitFilter.HEADER_LIMIT);
    }

    @Test
    void anonymousRequestsAreKeyedByIp() {
        http.get()
                .uri("/api/v1/public/legal/documents")
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .valueEquals(RateLimitFilter.HEADER_LIMIT, "1000")
                .expectHeader()
                .exists(RateLimitFilter.HEADER_REMAINING);
    }
}
