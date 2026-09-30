package com.orenjitrade.api.auth.infra;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import com.orenjitrade.api.auth.domain.IdentityTokenVerifier;
import com.orenjitrade.api.auth.domain.InvalidIdentityTokenException;
import com.orenjitrade.api.auth.domain.VerifiedIdentity;
import java.time.Instant;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Verifies Firebase ID tokens with the Admin SDK. Revocation is not checked on every request
 * ({@code checkRevoked=false}: it would cost a network round trip); suspension and deletion are
 * enforced from our own database instead, and disabling the Firebase user stops token refresh.
 */
@Component
@Profile("!test")
public class FirebaseIdentityTokenVerifier implements IdentityTokenVerifier {

    static final String CLAIM_AUTH_TIME = "auth_time";
    static final String CLAIM_FIREBASE = "firebase";
    static final String CLAIM_SIGN_IN_PROVIDER = "sign_in_provider";
    static final String CLAIM_SIGN_IN_SECOND_FACTOR = "sign_in_second_factor";

    private static final Logger log = LoggerFactory.getLogger(FirebaseIdentityTokenVerifier.class);

    private final FirebaseAuth firebaseAuth;

    public FirebaseIdentityTokenVerifier(FirebaseAuth firebaseAuth) {
        this.firebaseAuth = firebaseAuth;
    }

    @Override
    public VerifiedIdentity verify(String token) {
        FirebaseToken decoded;
        try {
            decoded = firebaseAuth.verifyIdToken(token, false);
        } catch (FirebaseAuthException e) {
            log.debug("Firebase rejected an ID token: {}", e.getAuthErrorCode());
            throw new InvalidIdentityTokenException(messageFor(e), e);
        } catch (IllegalArgumentException e) {
            throw new InvalidIdentityTokenException("The access token is malformed", e);
        }
        return toIdentity(decoded);
    }

    static VerifiedIdentity toIdentity(FirebaseToken decoded) {
        Map<String, Object> claims = decoded.getClaims();
        Instant authTime = Instant.EPOCH;
        if (claims.get(CLAIM_AUTH_TIME) instanceof Number seconds) {
            authTime = Instant.ofEpochSecond(seconds.longValue());
        }
        @Nullable String signInProvider = null;
        boolean secondFactor = false;
        if (claims.get(CLAIM_FIREBASE) instanceof Map<?, ?> firebase) {
            Object provider = firebase.get(CLAIM_SIGN_IN_PROVIDER);
            signInProvider = provider instanceof String value ? value : null;
            Object factor = firebase.get(CLAIM_SIGN_IN_SECOND_FACTOR);
            secondFactor = factor instanceof String value && !value.isBlank();
        }
        return new VerifiedIdentity(
                decoded.getUid(),
                decoded.getEmail(),
                decoded.isEmailVerified(),
                authTime,
                signInProvider,
                secondFactor,
                claims);
    }

    private static String messageFor(FirebaseAuthException e) {
        if (e.getAuthErrorCode() == null) {
            return "The access token could not be verified";
        }
        return switch (e.getAuthErrorCode()) {
            case EXPIRED_ID_TOKEN -> "The access token has expired";
            case REVOKED_ID_TOKEN -> "The access token has been revoked";
            case USER_DISABLED -> "The account is disabled";
            case INVALID_ID_TOKEN -> "The access token is invalid";
            case CERTIFICATE_FETCH_FAILED -> "The access token could not be verified";
            default -> "The access token is not acceptable";
        };
    }
}
