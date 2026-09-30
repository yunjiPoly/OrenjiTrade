package com.orenjitrade.api.auth.web;

import com.orenjitrade.api.auth.domain.AccountResolver;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.IdentityTokenVerifier;
import com.orenjitrade.api.auth.domain.InvalidIdentityTokenException;
import com.orenjitrade.api.auth.domain.ResolvedAccount;
import com.orenjitrade.api.auth.domain.UserAuthentication;
import com.orenjitrade.api.auth.domain.VerifiedIdentity;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Turns {@code Authorization: Bearer <ID token>} into a {@link UserAuthentication}: verifies the
 * token, loads or provisions the account through {@link AccountResolver} and records activity.
 *
 * <p>A request without a bearer token continues anonymously (public routes work, protected ones end
 * in 401 at the authorization filter). A request with an unacceptable token is rejected with 401
 * immediately. {@code /internal/**} is skipped: those routes use {@link ServiceAuthFilter}.
 */
public class BearerTokenAuthenticationFilter extends OncePerRequestFilter {

    static final String BEARER_SCHEME = "Bearer";
    static final String INTERNAL_PREFIX = "/internal/";

    private static final Logger log =
            LoggerFactory.getLogger(BearerTokenAuthenticationFilter.class);

    private final IdentityTokenVerifier verifier;
    private final AccountResolver accounts;
    private final AuthenticationEntryPoint entryPoint;
    private final SecurityContextRepository contextRepository =
            new RequestAttributeSecurityContextRepository();
    private final WebAuthenticationDetailsSource detailsSource =
            new WebAuthenticationDetailsSource();

    public BearerTokenAuthenticationFilter(
            IdentityTokenVerifier verifier,
            AccountResolver accounts,
            AuthenticationEntryPoint entryPoint) {
        this.verifier = verifier;
        this.accounts = accounts;
        this.entryPoint = entryPoint;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return request.getRequestURI().startsWith(INTERNAL_PREFIX);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        @Nullable String token = extractToken(request.getHeader(HttpHeaders.AUTHORIZATION));
        if (token == null) {
            chain.doFilter(request, response);
            return;
        }
        if (token.isEmpty()) {
            reject(request, response, "The Authorization header carries no token", null);
            return;
        }
        VerifiedIdentity identity;
        ResolvedAccount account;
        try {
            identity = verifier.verify(token);
            account = accounts.resolve(identity);
        } catch (InvalidIdentityTokenException e) {
            reject(request, response, e.getMessage(), e);
            return;
        }
        AuthenticatedUser user =
                new AuthenticatedUser(
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
        UserAuthentication authentication = new UserAuthentication(user);
        authentication.setDetails(detailsSource.buildDetails(request));
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);
        try {
            accounts.recordActivity(user.userId());
        } catch (RuntimeException e) {
            log.warn("Could not record activity for user {}: {}", user.userId(), e.getMessage());
        }
        chain.doFilter(request, response);
    }

    /** {@code null} when there is no bearer scheme; the (possibly empty) token otherwise. */
    static @Nullable String extractToken(@Nullable String authorization) {
        if (authorization == null) {
            return null;
        }
        String trimmed = authorization.trim();
        int schemeLength = BEARER_SCHEME.length();
        if (trimmed.length() < schemeLength
                || !trimmed.regionMatches(true, 0, BEARER_SCHEME, 0, schemeLength)) {
            return null;
        }
        if (trimmed.length() == schemeLength) {
            return ""; // "Bearer" without a token
        }
        if (!Character.isWhitespace(trimmed.charAt(schemeLength))) {
            return null; // some other scheme that merely starts with "Bearer"
        }
        return trimmed.substring(schemeLength).trim();
    }

    private void reject(
            HttpServletRequest request,
            HttpServletResponse response,
            String message,
            @Nullable Throwable cause)
            throws IOException, ServletException {
        SecurityContextHolder.clearContext();
        entryPoint.commence(request, response, new InvalidBearerTokenException(message, cause));
    }
}
