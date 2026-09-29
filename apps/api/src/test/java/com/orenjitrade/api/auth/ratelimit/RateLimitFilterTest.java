package com.orenjitrade.api.auth.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.auth.domain.UserAuthentication;
import com.orenjitrade.api.auth.ratelimit.RateLimitPolicy.KeyBy;
import com.orenjitrade.api.common.ProblemDetailFactory;
import com.orenjitrade.api.common.TimeProvider;
import jakarta.servlet.ServletException;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.json.JsonMapper;

class RateLimitFilterTest {

    private static final Instant NOW = Instant.parse("2026-09-29T12:00:30Z");

    private final Map<String, AtomicLong> counters = new ConcurrentHashMap<>();
    private final AtomicInteger redisFailures = new AtomicInteger();
    private final RateLimiter limiter =
            (key, windowMillis) -> {
                if (redisFailures.get() > 0) {
                    redisFailures.decrementAndGet();
                    return OptionalLong.empty();
                }
                return OptionalLong.of(
                        counters.computeIfAbsent(key, k -> new AtomicLong()).incrementAndGet());
            };
    private final ProblemDetailFactory problems =
            new ProblemDetailFactory(TimeProvider.fixed(NOW), JsonMapper.builder().build());

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void countsPerUserAndRejectsBeyondTheLimit() throws Exception {
        RateLimitFilter filter = filter(policy("me", "/api/v1/me", 2, 60, KeyBy.USER));
        UUID userId = UUID.randomUUID();
        authenticate(userId);

        MockHttpServletResponse first = call(filter, "/api/v1/me");
        MockHttpServletResponse second = call(filter, "/api/v1/me");
        MockHttpServletResponse third = call(filter, "/api/v1/me");

        assertThat(first.getStatus()).isEqualTo(200);
        assertThat(first.getHeader(RateLimitFilter.HEADER_LIMIT)).isEqualTo("2");
        assertThat(first.getHeader(RateLimitFilter.HEADER_REMAINING)).isEqualTo("1");
        assertThat(second.getHeader(RateLimitFilter.HEADER_REMAINING)).isEqualTo("0");
        assertThat(third.getStatus()).isEqualTo(429);
        assertThat(third.getHeader(RateLimitFilter.HEADER_REMAINING)).isEqualTo("0");
        // Window started at 12:00:00; 30 s elapsed of 60 -> 30 s to wait.
        assertThat(third.getHeader("Retry-After")).isEqualTo("30");
        assertThat(third.getContentType()).startsWith("application/problem+json");
        assertThat(third.getContentAsString())
                .contains("\"errorCode\":\"RATE_LIMITED\"")
                .contains("\"retryAfterSeconds\":30")
                .contains("\"limit\":2");
        assertThat(counters.keySet())
                .containsExactly(
                        "rl:me:USER:" + userId + ":" + NOW.minusSeconds(30).toEpochMilli());
    }

    @Test
    void anonymousRequestsAreKeyedByRemoteAddress() throws Exception {
        RateLimitFilter filter = filter(policy("anon", "/api/**", 1, 60, KeyBy.IP));

        MockHttpServletResponse first = call(filter, "/api/v1/public/legal/documents");
        MockHttpServletResponse second = call(filter, "/api/v1/public/legal/documents");

        assertThat(first.getStatus()).isEqualTo(200);
        assertThat(second.getStatus()).isEqualTo(429);
        assertThat(counters.keySet()).allMatch(key -> key.startsWith("rl:anon:IP:127.0.0.1:"));
    }

    @Test
    void failsOpenWhenTheStoreIsUnavailable() throws Exception {
        RateLimitFilter filter = filter(policy("me", "/api/v1/me", 1, 60, KeyBy.USER));
        authenticate(UUID.randomUUID());
        redisFailures.set(3);

        for (int i = 0; i < 3; i++) {
            MockHttpServletResponse response = call(filter, "/api/v1/me");
            assertThat(response.getStatus()).isEqualTo(200);
            assertThat(response.getHeader(RateLimitFilter.HEADER_LIMIT)).isNull();
        }
    }

    @Test
    void disabledFilterDoesNothing() throws Exception {
        RateLimitProperties properties =
                new RateLimitProperties(
                        false, List.of(policy("me", "/api/v1/me", 1, 60, KeyBy.USER)));
        RateLimitFilter filter =
                new RateLimitFilter(properties, limiter, problems, TimeProvider.fixed(NOW));
        authenticate(UUID.randomUUID());

        for (int i = 0; i < 3; i++) {
            assertThat(call(filter, "/api/v1/me").getStatus()).isEqualTo(200);
        }
        assertThat(counters).isEmpty();
    }

    @Test
    void unmatchedRoutesPassThroughWithoutHeaders() throws Exception {
        RateLimitFilter filter = filter(policy("me", "/api/v1/me", 1, 60, KeyBy.USER));

        MockHttpServletResponse response = call(filter, "/actuator/health");

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getHeader(RateLimitFilter.HEADER_LIMIT)).isNull();
        assertThat(counters).isEmpty();
    }

    private RateLimitFilter filter(RateLimitPolicy policy) {
        return new RateLimitFilter(
                new RateLimitProperties(true, List.of(policy)),
                limiter,
                problems,
                TimeProvider.fixed(NOW));
    }

    private static RateLimitPolicy policy(
            String name, String pattern, int limit, int windowSeconds, KeyBy keyBy) {
        return new RateLimitPolicy(name, List.of(pattern), null, limit, windowSeconds, keyBy, null);
    }

    private static void authenticate(UUID userId) {
        AuthenticatedUser user =
                new AuthenticatedUser(
                        userId,
                        "uid-" + userId,
                        "u@example.test",
                        true,
                        "handle",
                        Set.of(Role.USER),
                        AccountStatus.ACTIVE,
                        null,
                        NOW,
                        false);
        SecurityContextHolder.getContext().setAuthentication(new UserAuthentication(user));
    }

    private static MockHttpServletResponse call(RateLimitFilter filter, String path)
            throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.setRemoteAddr("127.0.0.1");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
}
