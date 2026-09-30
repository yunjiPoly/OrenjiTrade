package com.orenjitrade.api.config;

import java.util.List;
import java.util.Locale;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.security.*} settings.
 *
 * @param cors browser origins allowed to call the API with credentials
 * @param hsts HTTP Strict Transport Security (disabled for {@code local}/{@code test})
 * @param admin admin console access rules
 * @param serviceToken shared secret accepted as {@code X-Service-Token} on {@code /internal/**}
 *     (env {@code SERVICE_TOKEN}); the default is refused in staging/prod
 * @param internalAudience expected {@code aud} of Google OIDC tokens presented to {@code
 *     /internal/**} (the Cloud Run service URL); empty disables the OIDC path
 * @param internalInvokers service-account emails allowed to call {@code /internal/**} with an OIDC
 *     token
 */
@ConfigurationProperties(prefix = "orenji.security")
public record OrenjiSecurityProperties(
        @DefaultValue Cors cors,
        @DefaultValue Hsts hsts,
        @DefaultValue Admin admin,
        @DefaultValue(DEFAULT_SERVICE_TOKEN) String serviceToken,
        @DefaultValue("") String internalAudience,
        @Nullable List<String> internalInvokers) {

    /** Development-only token; refused by the startup validator in staging and production. */
    public static final String DEFAULT_SERVICE_TOKEN = "local-service-token";

    public OrenjiSecurityProperties {
        internalInvokers =
                internalInvokers == null
                        ? List.of()
                        : internalInvokers.stream()
                                .map(String::trim)
                                .filter(s -> !s.isEmpty())
                                .map(s -> s.toLowerCase(Locale.ROOT))
                                .toList();
    }

    @Override
    public List<String> internalInvokers() {
        return internalInvokers == null ? List.of() : internalInvokers;
    }

    /**
     * @param allowedOrigins exact origins (or patterns containing {@code *}); bound from the comma
     *     separated {@code CORS_ALLOWED_ORIGINS}
     */
    public record Cors(@Nullable List<String> allowedOrigins) {
        public Cors {
            allowedOrigins =
                    allowedOrigins == null
                            ? List.of()
                            : allowedOrigins.stream()
                                    .map(String::trim)
                                    .filter(s -> !s.isEmpty())
                                    .toList();
        }

        @Override
        public List<String> allowedOrigins() {
            return allowedOrigins == null ? List.of() : allowedOrigins;
        }
    }

    /**
     * @param enabled whether the {@code Strict-Transport-Security} header is written (over HTTPS)
     * @param maxAgeSeconds header max-age
     * @param includeSubdomains whether to add {@code includeSubDomains}
     */
    public record Hsts(
            @DefaultValue("true") boolean enabled,
            @DefaultValue("31536000") long maxAgeSeconds,
            @DefaultValue("true") boolean includeSubdomains) {}

    /**
     * @param requireMfa whether {@code /api/v1/admin/**} additionally requires an ID token issued
     *     after a second factor ({@code firebase.sign_in_second_factor}); {@code false} for local
     *     and test
     */
    public record Admin(@DefaultValue("true") boolean requireMfa) {}
}
