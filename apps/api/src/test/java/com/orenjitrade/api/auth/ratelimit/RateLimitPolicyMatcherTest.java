package com.orenjitrade.api.auth.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.auth.ratelimit.RateLimitPolicy.AppliesTo;
import com.orenjitrade.api.auth.ratelimit.RateLimitPolicy.KeyBy;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class RateLimitPolicyMatcherTest {

    private static final RateLimitPolicy AVATAR =
            new RateLimitPolicy(
                    "avatar-export",
                    List.of("/api/v1/me/profile/avatar", "/api/v1/me/export"),
                    List.of("post", "GET"),
                    10,
                    3600,
                    KeyBy.USER,
                    null);
    private static final RateLimitPolicy DELETION =
            new RateLimitPolicy(
                    "deletion-requests",
                    List.of("/api/v1/me/deletion-requests", "/api/v1/me/deletion-requests/**"),
                    null,
                    5,
                    86400,
                    KeyBy.USER,
                    null);
    private static final RateLimitPolicy TAGS =
            new RateLimitPolicy(
                    "tags-search",
                    List.of("/api/v1/tags"),
                    List.of("GET"),
                    60,
                    60,
                    KeyBy.USER,
                    null);
    private static final RateLimitPolicy DEFAULT_USER =
            new RateLimitPolicy(
                    "default-authenticated", List.of("/api/**"), null, 120, 60, KeyBy.USER, null);
    private static final RateLimitPolicy DEFAULT_IP =
            new RateLimitPolicy(
                    "default-anonymous", List.of("/api/**"), null, 60, 60, KeyBy.IP, null);

    private final RateLimitPolicyMatcher matcher =
            new RateLimitPolicyMatcher(List.of(AVATAR, DELETION, TAGS, DEFAULT_USER, DEFAULT_IP));

    @Test
    void firstMatchingPolicyWins() {
        assertThat(name(matcher.match("POST", "/api/v1/me/profile/avatar", true)))
                .isEqualTo("avatar-export");
        assertThat(name(matcher.match("GET", "/api/v1/me/export", true)))
                .isEqualTo("avatar-export");
        assertThat(name(matcher.match("DELETE", "/api/v1/me/profile/avatar", true)))
                .as("method not covered by the specific policy falls through to the default")
                .isEqualTo("default-authenticated");
        assertThat(name(matcher.match("POST", "/api/v1/me/deletion-requests", true)))
                .isEqualTo("deletion-requests");
        assertThat(name(matcher.match("DELETE", "/api/v1/me/deletion-requests/abc", true)))
                .isEqualTo("deletion-requests");
        assertThat(name(matcher.match("GET", "/api/v1/tags", true))).isEqualTo("tags-search");
        assertThat(name(matcher.match("GET", "/api/v1/me", true)))
                .isEqualTo("default-authenticated");
    }

    @Test
    void anonymousRequestsUseIpPoliciesOnly() {
        assertThat(name(matcher.match("GET", "/api/v1/public/legal/documents", false)))
                .isEqualTo("default-anonymous");
        assertThat(name(matcher.match("GET", "/api/v1/tags", false)))
                .as("USER policies never apply to anonymous callers")
                .isEqualTo("default-anonymous");
        assertThat(name(matcher.match("GET", "/api/v1/me", true)))
                .as("IP policies with the ANONYMOUS default never apply to authenticated callers")
                .isEqualTo("default-authenticated");
    }

    @Test
    void routesOutsideEveryPatternAreNotLimited() {
        assertThat(matcher.match("GET", "/actuator/health/readiness", false)).isEmpty();
        assertThat(matcher.match("POST", "/internal/jobs/ping", false)).isEmpty();
        assertThat(matcher.match("GET", "/v3/api-docs", true)).isEmpty();
    }

    @Test
    void appliesToAllCoversBothKinds() {
        RateLimitPolicy everyone =
                new RateLimitPolicy(
                        "everyone", List.of("/api/**"), null, 5, 60, KeyBy.IP, AppliesTo.ALL);
        RateLimitPolicyMatcher all = new RateLimitPolicyMatcher(List.of(everyone));

        assertThat(name(all.match("GET", "/api/v1/me", true))).isEqualTo("everyone");
        assertThat(name(all.match("GET", "/api/v1/me", false))).isEqualTo("everyone");
    }

    @Test
    void policyDefaultsAndValidation() {
        assertThat(AVATAR.methods()).containsExactly("POST", "GET");
        assertThat(AVATAR.appliesTo()).isEqualTo(AppliesTo.AUTHENTICATED);
        assertThat(DEFAULT_IP.appliesTo()).isEqualTo(AppliesTo.ANONYMOUS);
        assertThat(DEFAULT_IP.windowMillis()).isEqualTo(60_000L);
        assertThatThrownBy(
                        () -> new RateLimitPolicy(" ", List.of("/x"), null, 1, 1, KeyBy.USER, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RateLimitPolicy("x", List.of(), null, 1, 1, KeyBy.USER, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
                        () ->
                                new RateLimitPolicy(
                                        "x", List.of("/x"), null, 0, 60, KeyBy.USER, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static String name(Optional<RateLimitPolicy> policy) {
        return policy.map(RateLimitPolicy::name).orElse("<none>");
    }
}
