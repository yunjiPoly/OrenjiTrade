package com.orenjitrade.api.config;

import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.security.*} settings.
 *
 * @param cors browser origins allowed to call the API with credentials
 * @param hsts HTTP Strict Transport Security (disabled for {@code local}/{@code test})
 */
@ConfigurationProperties(prefix = "orenji.security")
public record OrenjiSecurityProperties(@DefaultValue Cors cors, @DefaultValue Hsts hsts) {

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
}
