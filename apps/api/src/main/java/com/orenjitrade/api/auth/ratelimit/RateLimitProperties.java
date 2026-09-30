package com.orenjitrade.api.auth.ratelimit;

import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.ratelimit.*}: fixed-window rate-limit policies evaluated in order; the first policy
 * whose path patterns, methods and scope match a request applies (list specific policies before the
 * defaults). A DB-backed override arrives with the admin console (Phase 7).
 *
 * @param enabled master switch ({@code false} under the test profile unless a test opts in)
 * @param policies ordered policies
 */
@ConfigurationProperties(prefix = "orenji.ratelimit")
public record RateLimitProperties(
        @DefaultValue("true") boolean enabled, @Nullable List<RateLimitPolicy> policies) {

    public RateLimitProperties {
        policies = policies == null ? List.of() : List.copyOf(policies);
    }

    @Override
    public List<RateLimitPolicy> policies() {
        return policies == null ? List.of() : policies;
    }
}
