package com.orenjitrade.api.users.infra;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.consents.*}.
 *
 * @param ipSalt server-side salt mixed into the SHA-256 hash of the client IP stored with each
 *     consent ({@code CONSENT_IP_SALT}); the default is for local development only
 */
@ConfigurationProperties(prefix = "orenji.consents")
public record ConsentProperties(@DefaultValue(DEFAULT_IP_SALT) String ipSalt) {

    public static final String DEFAULT_IP_SALT = "local-consent-salt";
}
