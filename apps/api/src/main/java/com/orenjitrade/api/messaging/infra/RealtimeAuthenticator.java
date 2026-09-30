package com.orenjitrade.api.messaging.infra;

import com.orenjitrade.api.auth.domain.AccountResolver;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.IdentityTokenVerifier;
import com.orenjitrade.api.auth.domain.InvalidIdentityTokenException;
import com.orenjitrade.api.auth.domain.ResolvedAccount;
import com.orenjitrade.api.auth.domain.VerifiedIdentity;
import com.orenjitrade.api.common.TimeProvider;
import java.util.Locale;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Authenticates a realtime connection with a Firebase ID token through the same {@link
 * IdentityTokenVerifier} and {@link AccountResolver} as the REST bearer filter (Phase 5 contract
 * "Realtime"). Suspended, deletion-pending and deleted accounts are refused.
 */
@Component
public class RealtimeAuthenticator {

    private final IdentityTokenVerifier verifier;
    private final AccountResolver accounts;
    private final TimeProvider timeProvider;

    public RealtimeAuthenticator(
            IdentityTokenVerifier verifier, AccountResolver accounts, TimeProvider timeProvider) {
        this.verifier = verifier;
        this.accounts = accounts;
        this.timeProvider = timeProvider;
    }

    /**
     * @param token raw ID token (a {@code Bearer } prefix is tolerated)
     * @return the principal of the realtime session (its name is the account id)
     * @throws RealtimeAuthenticationException with the HTTP status to answer a handshake with
     */
    public AuthenticatedUser authenticate(@Nullable String token) {
        @Nullable String raw = stripBearer(token);
        if (raw == null || raw.isEmpty()) {
            throw new RealtimeAuthenticationException(
                    HttpStatus.UNAUTHORIZED, "Authentication required");
        }
        VerifiedIdentity identity;
        ResolvedAccount account;
        try {
            identity = verifier.verify(raw);
            account = accounts.resolve(identity);
        } catch (InvalidIdentityTokenException e) {
            throw new RealtimeAuthenticationException(
                    HttpStatus.UNAUTHORIZED, "Invalid or expired token");
        }
        boolean suspended =
                account.status() == AccountStatus.SUSPENDED
                        && (account.suspendedUntil() == null
                                || account.suspendedUntil().isAfter(timeProvider.now()));
        if (suspended
                || account.status() == AccountStatus.DELETION_REQUESTED
                || account.status() == AccountStatus.DELETED) {
            throw new RealtimeAuthenticationException(
                    HttpStatus.FORBIDDEN, "This account cannot connect");
        }
        return new AuthenticatedUser(
                account.userId(),
                identity.providerUid(),
                account.email(),
                account.emailVerified(),
                account.handle(),
                account.roles(),
                account.status(),
                account.suspendedUntil(),
                identity.authTime(),
                identity.secondFactorUsed());
    }

    /** The token without an optional (case-insensitive) {@code Bearer } scheme. */
    static @Nullable String stripBearer(@Nullable String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.toLowerCase(Locale.ROOT).startsWith("bearer ")) {
            return trimmed.substring("bearer ".length()).trim();
        }
        return trimmed;
    }

    /** A refused realtime authentication; the message is safe to send to the client. */
    public static final class RealtimeAuthenticationException extends RuntimeException {

        private static final long serialVersionUID = 1L;

        private final HttpStatus status;

        public RealtimeAuthenticationException(HttpStatus status, String message) {
            super(message, null, false, false);
            this.status = status;
        }

        public HttpStatus status() {
            return status;
        }
    }
}
