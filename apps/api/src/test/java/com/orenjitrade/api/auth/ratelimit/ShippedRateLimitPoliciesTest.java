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
}
