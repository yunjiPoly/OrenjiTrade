package com.orenjitrade.api.location.infra;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.location.*}.
 *
 * @param jitterSecret HMAC-SHA256 key seeding the deterministic public-point jitter ({@code
 *     LOCATION_JITTER_SECRET}); a development default exists only under the {@code local} and
 *     {@code test} profiles, every other profile refuses to start without a real secret
 * @param geocoder region label source; only {@code static} ({@link StaticRegionGeocoder}) exists
 */
@ConfigurationProperties(prefix = "orenji.location")
public record LocationProperties(
        @DefaultValue("") String jitterSecret, @DefaultValue("static") String geocoder) {

    /** The development default configured for the local and test profiles. */
    public static final String DEVELOPMENT_SECRET = "local-jitter-secret";
}
