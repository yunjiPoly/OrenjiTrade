package com.orenjitrade.api.auth.ratelimit;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.http.server.PathContainer;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

/** Pure matching of requests against the ordered policy list (first match wins). */
public final class RateLimitPolicyMatcher {

    private final List<CompiledPolicy> policies;

    public RateLimitPolicyMatcher(List<RateLimitPolicy> policies) {
        PathPatternParser parser = new PathPatternParser();
        List<CompiledPolicy> compiled = new ArrayList<>();
        for (RateLimitPolicy policy : policies) {
            List<PathPattern> patterns = policy.pathPatterns().stream().map(parser::parse).toList();
            compiled.add(new CompiledPolicy(policy, patterns));
        }
        this.policies = List.copyOf(compiled);
    }

    /**
     * @param method HTTP method
     * @param path request path (URI without query string)
     * @param authenticated whether a collector is authenticated
     */
    public Optional<RateLimitPolicy> match(String method, String path, boolean authenticated) {
        String upperMethod = method.toUpperCase(Locale.ROOT);
        PathContainer container = PathContainer.parsePath(path);
        for (CompiledPolicy candidate : policies) {
            RateLimitPolicy policy = candidate.policy();
            if (!appliesTo(policy, authenticated)) {
                continue;
            }
            if (!policy.methods().isEmpty() && !policy.methods().contains(upperMethod)) {
                continue;
            }
            for (PathPattern pattern : candidate.patterns()) {
                if (pattern.matches(container)) {
                    return Optional.of(policy);
                }
            }
        }
        return Optional.empty();
    }

    private static boolean appliesTo(RateLimitPolicy policy, boolean authenticated) {
        return switch (policy.appliesTo()) {
            case ALL -> true;
            case AUTHENTICATED -> authenticated;
            case ANONYMOUS -> !authenticated;
        };
    }

    private record CompiledPolicy(RateLimitPolicy policy, List<PathPattern> patterns) {}
}
