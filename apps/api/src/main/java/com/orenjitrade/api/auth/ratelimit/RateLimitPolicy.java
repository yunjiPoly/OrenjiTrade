package com.orenjitrade.api.auth.ratelimit;

import java.util.List;
import java.util.Locale;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * One rate-limit policy.
 *
 * @param name short identifier, part of the Redis key
 * @param pathPatterns Spring path patterns ({@code /api/v1/me/**}); at least one
 * @param methods HTTP methods the policy applies to; empty means every method
 * @param limit requests allowed per window
 * @param windowSeconds window length
 * @param keyBy whether the counter is per authenticated user or per client IP
 * @param appliesTo which requests the policy considers; defaults to {@code AUTHENTICATED} for
 *     {@code USER} keys and {@code ANONYMOUS} for {@code IP} keys
 */
public record RateLimitPolicy(
        String name,
        List<String> pathPatterns,
        @Nullable List<String> methods,
        int limit,
        @DefaultValue("60") int windowSeconds,
        @DefaultValue("USER") KeyBy keyBy,
        @Nullable AppliesTo appliesTo) {

    public RateLimitPolicy {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("rate-limit policy name must not be blank");
        }
        if (pathPatterns == null || pathPatterns.isEmpty()) {
            throw new IllegalArgumentException(
                    "rate-limit policy " + name + " needs at least one path pattern");
        }
        if (limit <= 0 || windowSeconds <= 0) {
            throw new IllegalArgumentException(
                    "rate-limit policy " + name + " needs a positive limit and window");
        }
        pathPatterns = List.copyOf(pathPatterns);
        methods =
                methods == null
                        ? List.of()
                        : methods.stream().map(m -> m.trim().toUpperCase(Locale.ROOT)).toList();
        appliesTo =
                appliesTo != null
                        ? appliesTo
                        : (keyBy == KeyBy.USER ? AppliesTo.AUTHENTICATED : AppliesTo.ANONYMOUS);
    }

    @Override
    public List<String> methods() {
        return methods == null ? List.of() : methods;
    }

    @Override
    public AppliesTo appliesTo() {
        return appliesTo == null ? AppliesTo.ANONYMOUS : appliesTo;
    }

    public long windowMillis() {
        return windowSeconds * 1000L;
    }

    /** What identifies the subject of the counter. */
    public enum KeyBy {
        USER,
        IP
    }

    /** Which requests a policy considers. */
    public enum AppliesTo {
        AUTHENTICATED,
        ANONYMOUS,
        ALL
    }
}
