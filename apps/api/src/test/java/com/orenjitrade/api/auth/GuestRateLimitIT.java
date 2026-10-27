package com.orenjitrade.api.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.ratelimit.RateLimitFilter;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

/**
 * The rate limit of a signed-out visitor browsing (stage R15): the open reads of Home and Search
 * are counted by address, a member is not, and the address lives only in a Redis key that expires
 * with its window (ADR 0017: never stored, logged or used for geography). A tiny policy here; the
 * shipped one is checked by {@code ShippedRateLimitPoliciesTest}. A one-day window, so the test
 * never straddles two windows.
 */
@TestPropertySource(
        properties = {
            "orenji.ratelimit.enabled=true",
            "orenji.ratelimit.policies[0].name=it-guest",
            "orenji.ratelimit.policies[0].path-patterns[0]=/api/v1/feed",
            "orenji.ratelimit.policies[0].path-patterns[1]=/api/v1/search/**",
            "orenji.ratelimit.policies[0].methods[0]=GET",
            "orenji.ratelimit.policies[0].limit=3",
            "orenji.ratelimit.policies[0].window-seconds=86400",
            "orenji.ratelimit.policies[0].key-by=IP",
            "orenji.ratelimit.policies[0].applies-to=ANONYMOUS",
            "orenji.ratelimit.policies[1].name=it-member",
            "orenji.ratelimit.policies[1].path-patterns[0]=/api/**",
            "orenji.ratelimit.policies[1].limit=1000",
            "orenji.ratelimit.policies[1].window-seconds=86400",
            "orenji.ratelimit.policies[1].key-by=USER"
        })
class GuestRateLimitIT extends AbstractIntegrationTest {

    @Autowired private StringRedisTemplate redis;

    @Test
    void aGuestIsLimitedByAddressInAWindowThatExpires() {
        for (String key : keys()) {
            redis.delete(key);
        }
        String[] reads = {
            "/api/v1/feed?game=yugioh",
            "/api/v1/search/card-holders?cardId=00000000-0000-4000-8000-000000000001",
            "/api/v1/feed?game=yugioh&kind=WANTED"
        };
        for (int call = 0; call < reads.length; call++) {
            http.get()
                    .uri(reads[call])
                    .exchange()
                    .expectStatus()
                    .isOk()
                    .expectHeader()
                    .valueEquals(RateLimitFilter.HEADER_LIMIT, "3")
                    .expectHeader()
                    .valueEquals(RateLimitFilter.HEADER_REMAINING, String.valueOf(2 - call));
        }
        http.get()
                .uri("/api/v1/feed?game=yugioh")
                .exchange()
                .expectStatus()
                .isEqualTo(429)
                .expectHeader()
                .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectHeader()
                .exists(HttpHeaders.RETRY_AFTER)
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("RATE_LIMITED");

        // A member is counted by account under their own policy, never by this address.
        String uid = uniqueUid("guest-limit-member");
        provisionCompliant(uid);
        http.get()
                .uri("/api/v1/feed?game=yugioh")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .valueEquals(RateLimitFilter.HEADER_LIMIT, "1000");

        // The address is only the key of a counter that expires with its window.
        Set<String> keys = keys();
        assertThat(keys).hasSize(1);
        String key = keys.iterator().next();
        assertThat(key).startsWith("rl:it-guest:IP:");
        Long ttl = redis.getExpire(key, java.util.concurrent.TimeUnit.MILLISECONDS);
        assertThat(ttl).isNotNull().isPositive().isLessThanOrEqualTo(86_400_000L);
        assertThat(redis.opsForValue().get(key)).isEqualTo("4");
    }

    private Set<String> keys() {
        Set<String> keys = redis.keys("rl:it-guest:*");
        return keys == null ? Set.of() : keys;
    }
}
