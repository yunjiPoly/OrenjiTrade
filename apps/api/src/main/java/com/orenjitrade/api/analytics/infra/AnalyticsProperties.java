package com.orenjitrade.api.analytics.infra;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.analytics.*}.
 *
 * @param actorSalt HMAC key pseudonymising account ids in analytics events ({@code
 *     ANALYTICS_ACTOR_SALT}); a development default exists only under the {@code local} and {@code
 *     test} profiles, every other profile refuses to start without a real salt
 * @param enabled whether analytics events are emitted at all
 */
@ConfigurationProperties(prefix = "orenji.analytics")
public record AnalyticsProperties(
        @DefaultValue("") String actorSalt, @DefaultValue("true") boolean enabled) {

    /** The development default configured for the local and test profiles. */
    public static final String DEVELOPMENT_SALT = "local-analytics-salt";
}
