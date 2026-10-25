package com.orenjitrade.api.auth.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.ratelimit.RateLimitPolicy.KeyBy;
import java.io.IOException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.PropertySourcesPlaceholdersResolver;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

/**
 * The policies {@code application.yml} ships (its first document, every profile), matched as the
 * filter matches them: the specific ones a stage added are reached before the defaults.
 */
class ShippedRateLimitPoliciesTest {

    private static RateLimitProperties shipped() throws IOException {
        List<PropertySource<?>> documents =
                new YamlPropertySourceLoader()
                        .load("application", new ClassPathResource("application.yml"));
        MutablePropertySources sources = new MutablePropertySources();
        sources.addFirst(documents.getFirst());
        Binder binder =
                new Binder(
                        ConfigurationPropertySources.from(sources),
                        new PropertySourcesPlaceholdersResolver(sources));
        return binder.bind("orenji.ratelimit", RateLimitProperties.class).get();
    }

    @Test
    void theHandleCheckHasItsOwnPolicyPerMember() throws IOException {
        RateLimitPolicyMatcher matcher = new RateLimitPolicyMatcher(shipped().policies());

        RateLimitPolicy policy =
                matcher.match("GET", "/api/v1/me/profile/handle-availability", true).orElseThrow();
        assertThat(policy.name()).isEqualTo("handle-availability");
        assertThat(policy.limit()).isEqualTo(60);
        assertThat(policy.windowSeconds()).isEqualTo(600);
        assertThat(policy.keyBy()).isEqualTo(KeyBy.USER);

        // The profile itself keeps the members' default.
        assertThat(matcher.match("GET", "/api/v1/me/profile", true).orElseThrow().name())
                .isEqualTo("default-authenticated");
        assertThat(matcher.match("PUT", "/api/v1/me/profile", true).orElseThrow().name())
                .isEqualTo("default-authenticated");
    }

    @Test
    void guestsBrowsingHaveAShortWindowByAddress() throws IOException {
        // Stage R15: the open reads of Home and Search, for signed-out callers only.
        RateLimitPolicyMatcher matcher = new RateLimitPolicyMatcher(shipped().policies());
        for (String path :
                java.util.List.of(
                        "/api/v1/feed",
                        "/api/v1/search",
                        "/api/v1/search/card-holders",
                        "/api/v1/search/deck-cores",
                        "/api/v1/search/collectors",
                        "/api/v1/search/suggest",
                        "/api/v1/regions/americas-north/binders",
                        "/api/v1/regions/americas-north/subdivisions/CA-QC/binders",
                        "/api/v1/public/binders/7d1f8a2e-0000-4000-8000-000000000001",
                        "/api/v1/public/binders/7d1f8a2e-0000-4000-8000-000000000001/items")) {
            RateLimitPolicy guest = matcher.match("GET", path, false).orElseThrow();
            assertThat(guest.name()).as(path).isEqualTo("guest-discovery");
            assertThat(guest.keyBy()).as(path).isEqualTo(KeyBy.IP);
            assertThat(guest.windowSeconds()).as(path).isLessThanOrEqualTo(10);
            assertThat(guest.limit()).as(path).isEqualTo(20);
            // Members keep their own default; card pictures keep theirs.
            assertThat(matcher.match("GET", path, true).orElseThrow().name())
                    .as(path)
                    .isEqualTo("default-authenticated");
        }
        assertThat(
                        matcher.match("GET", "/api/v1/public/card-images/abc", false)
                                .orElseThrow()
                                .name())
                .isEqualTo("card-images");
        assertThat(matcher.match("GET", "/api/v1/regions", false).orElseThrow().name())
                .isEqualTo("default-anonymous");
    }
}
