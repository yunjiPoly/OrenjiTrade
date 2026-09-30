package com.orenjitrade.api.auth.ratelimit;

import com.orenjitrade.api.auth.domain.UserAuthentication;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemDetailFactory;
import com.orenjitrade.api.common.TimeProvider;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import java.util.OptionalLong;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Applies the first matching {@link RateLimitPolicy} after authentication. Keys are {@code
 * rl:<policy>:USER:<id>:<windowStart>} or {@code rl:<policy>:IP:<address>:<windowStart>}. Every
 * limited response carries {@code X-RateLimit-Limit} and {@code X-RateLimit-Remaining}; a 429
 * problem ({@code RATE_LIMITED}) adds {@code Retry-After}. When Redis is down the request is let
 * through (fail open).
 *
 * <p>The client address is {@link HttpServletRequest#getRemoteAddr()}: with {@code
 * server.forward-headers-strategy=native} the container already resolved {@code X-Forwarded-For}
 * from the trusted proxy.
 */
public class RateLimitFilter extends OncePerRequestFilter {

    public static final String HEADER_LIMIT = "X-RateLimit-Limit";
    public static final String HEADER_REMAINING = "X-RateLimit-Remaining";
    static final String KEY_PREFIX = "rl:";

    private final boolean enabled;
    private final RateLimitPolicyMatcher matcher;
    private final RateLimiter limiter;
    private final ProblemDetailFactory problems;
    private final TimeProvider timeProvider;

    public RateLimitFilter(
            RateLimitProperties properties,
            RateLimiter limiter,
            ProblemDetailFactory problems,
            TimeProvider timeProvider) {
        this.enabled = properties.enabled();
        this.matcher = new RateLimitPolicyMatcher(properties.policies());
        this.limiter = limiter;
        this.problems = problems;
        this.timeProvider = timeProvider;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !enabled;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        @Nullable Authentication authentication =
                SecurityContextHolder.getContext().getAuthentication();
        @Nullable UserAuthentication user =
                authentication instanceof UserAuthentication userAuthentication
                        ? userAuthentication
                        : null;
        Optional<RateLimitPolicy> matched =
                matcher.match(request.getMethod(), request.getRequestURI(), user != null);
        if (matched.isEmpty()) {
            chain.doFilter(request, response);
            return;
        }
        RateLimitPolicy policy = matched.get();
        String subject =
                policy.keyBy() == RateLimitPolicy.KeyBy.USER && user != null
                        ? "USER:" + user.user().userId()
                        : "IP:" + request.getRemoteAddr();
        long nowMillis = timeProvider.now().toEpochMilli();
        long windowMillis = policy.windowMillis();
        long windowStart = nowMillis - Math.floorMod(nowMillis, windowMillis);
        String key = KEY_PREFIX + policy.name() + ":" + subject + ":" + windowStart;

        OptionalLong count = limiter.hit(key, windowMillis);
        if (count.isEmpty()) {
            chain.doFilter(request, response); // fail open
            return;
        }
        long used = count.getAsLong();
        long remaining = Math.max(0, policy.limit() - used);
        response.setHeader(HEADER_LIMIT, String.valueOf(policy.limit()));
        response.setHeader(HEADER_REMAINING, String.valueOf(remaining));
        if (used > policy.limit()) {
            long retryAfterSeconds =
                    Math.max(1, (windowStart + windowMillis - nowMillis + 999) / 1000);
            response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfterSeconds));
            ProblemDetail detail =
                    problems.create(
                            HttpStatus.TOO_MANY_REQUESTS,
                            ErrorCode.RATE_LIMITED,
                            "Too many requests; retry in " + retryAfterSeconds + " seconds",
                            null,
                            request.getRequestURI());
            detail.setProperty("limit", policy.limit());
            detail.setProperty("windowSeconds", policy.windowSeconds());
            detail.setProperty("retryAfterSeconds", retryAfterSeconds);
            problems.write(response, detail);
            return;
        }
        chain.doFilter(request, response);
    }
}
