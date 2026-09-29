package com.orenjitrade.api;

import com.orenjitrade.api.auth.domain.OidcIdentity;
import com.orenjitrade.api.auth.domain.OidcTokenVerifier;
import java.util.Optional;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Test-profile replacements for adapters that would need Google infrastructure, plus helpers to
 * shape accounts directly in the database. Imported by {@link AbstractIntegrationTest}.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestAuthConfiguration {

    /** Prefix of the fake OIDC tokens: {@code oidc:<email>}. */
    public static final String OIDC_TOKEN_PREFIX = "oidc:";

    /** Fake for the Google OIDC path of {@code /internal/**}: {@code oidc:<email>} verifies. */
    @Bean
    OidcTokenVerifier fakeOidcTokenVerifier() {
        return token -> {
            if (!token.startsWith(OIDC_TOKEN_PREFIX)) {
                return Optional.empty();
            }
            String email = token.substring(OIDC_TOKEN_PREFIX.length());
            return Optional.of(new OidcIdentity("sub-" + email, email, true));
        };
    }

    @Bean
    TestUsers testUsers(JdbcTemplate jdbc) {
        return new TestUsers(jdbc);
    }
}
