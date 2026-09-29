package com.orenjitrade.api.auth.infra;

import com.google.api.client.json.webtoken.JsonWebSignature;
import com.google.api.client.json.webtoken.JsonWebToken;
import com.google.auth.oauth2.TokenVerifier;
import com.orenjitrade.api.auth.domain.OidcIdentity;
import com.orenjitrade.api.auth.domain.OidcTokenVerifier;
import java.util.Optional;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Verifies Google-signed OIDC ID tokens (issuer {@value #ISSUER}) against the configured audience
 * using {@code google-auth-library}. Disabled (every token rejected) when no audience is
 * configured. Constructed by the security configuration; under the {@code test} profile a fake
 * replaces it.
 */
public class GoogleOidcTokenVerifier implements OidcTokenVerifier {

    public static final String ISSUER = "https://accounts.google.com";

    private static final Logger log = LoggerFactory.getLogger(GoogleOidcTokenVerifier.class);

    private final @Nullable TokenVerifier verifier;

    public GoogleOidcTokenVerifier(String audience) {
        if (audience.isBlank()) {
            this.verifier = null;
            log.info(
                    "Internal OIDC authentication disabled (no orenji.security.internal-audience)");
        } else {
            this.verifier =
                    TokenVerifier.newBuilder().setAudience(audience).setIssuer(ISSUER).build();
        }
    }

    @Override
    public Optional<OidcIdentity> verify(String token) {
        if (verifier == null) {
            return Optional.empty();
        }
        try {
            JsonWebSignature signature = verifier.verify(token);
            JsonWebToken.Payload payload = signature.getPayload();
            Object email = payload.get("email");
            Object verified = payload.get("email_verified");
            return Optional.of(
                    new OidcIdentity(
                            payload.getSubject(),
                            email instanceof String value ? value : null,
                            Boolean.TRUE.equals(verified)));
        } catch (TokenVerifier.VerificationException e) {
            log.debug("Rejected internal OIDC token: {}", e.getMessage());
            return Optional.empty();
        }
    }
}
