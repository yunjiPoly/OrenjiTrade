package com.orenjitrade.api.auth.web;

import com.orenjitrade.api.auth.domain.OidcIdentity;
import com.orenjitrade.api.auth.domain.OidcTokenVerifier;
import com.orenjitrade.api.auth.domain.ServiceAuthentication;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
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
 * Authenticates {@code /internal/**} callers (Cloud Scheduler, Pub/Sub push, the ML service):
 *
 * <ol>
 *   <li>{@code X-Service-Token} equal (constant time) to the configured shared token, or
 *   <li>{@code Authorization: Bearer <Google OIDC ID token>} whose audience is this service and
 *       whose (verified) email is one of the allowed invokers.
 * </ol>
 *
 * A request with neither continues anonymously and ends in 401 at the authorization filter; a
 * request with a bearer token that fails verification is rejected with 401 immediately.
 */
public class ServiceAuthFilter extends OncePerRequestFilter {

    public static final String SERVICE_TOKEN_HEADER = "X-Service-Token";
    static final String INTERNAL_PREFIX = "/internal/";

    private static final Logger log = LoggerFactory.getLogger(ServiceAuthFilter.class);

    private final byte[] serviceToken;
    private final @Nullable OidcTokenVerifier oidcVerifier;
    private final List<String> allowedInvokers;
    private final AuthenticationEntryPoint entryPoint;
    private final SecurityContextRepository contextRepository =
            new RequestAttributeSecurityContextRepository();
    private final WebAuthenticationDetailsSource detailsSource =
            new WebAuthenticationDetailsSource();

    public ServiceAuthFilter(
            String serviceToken,
            @Nullable OidcTokenVerifier oidcVerifier,
            List<String> allowedInvokers,
            AuthenticationEntryPoint entryPoint) {
        this.serviceToken = serviceToken.getBytes(StandardCharsets.UTF_8);
        this.oidcVerifier = oidcVerifier;
        this.allowedInvokers =
                allowedInvokers.stream().map(s -> s.trim().toLowerCase(Locale.ROOT)).toList();
        this.entryPoint = entryPoint;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(INTERNAL_PREFIX);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        @Nullable String presented = request.getHeader(SERVICE_TOKEN_HEADER);
        if (presented != null) {
            if (serviceToken.length > 0
                    && MessageDigest.isEqual(
                            serviceToken, presented.getBytes(StandardCharsets.UTF_8))) {
                authenticate(
                        request,
                        response,
                        ServiceAuthentication.SERVICE_TOKEN_PRINCIPAL,
                        ServiceAuthentication.Method.SERVICE_TOKEN);
                chain.doFilter(request, response);
            } else {
                reject(request, response, "The service token is invalid");
            }
            return;
        }
        @Nullable String bearer =
                BearerTokenAuthenticationFilter.extractToken(
                        request.getHeader(HttpHeaders.AUTHORIZATION));
        if (bearer != null && !bearer.isEmpty()) {
            Optional<OidcIdentity> identity =
                    oidcVerifier == null ? Optional.empty() : oidcVerifier.verify(bearer);
            if (identity.isPresent() && isAllowed(identity.get())) {
                authenticate(
                        request,
                        response,
                        String.valueOf(identity.get().email()),
                        ServiceAuthentication.Method.OIDC);
                chain.doFilter(request, response);
            } else {
                log.debug(
                        "Rejected internal OIDC call: verified={} email={}",
                        identity.isPresent(),
                        identity.map(OidcIdentity::email).orElse(null));
                reject(request, response, "The service credentials are not accepted");
            }
            return;
        }
        chain.doFilter(request, response);
    }

    private boolean isAllowed(OidcIdentity identity) {
        @Nullable String email = identity.email();
        return email != null
                && identity.emailVerified()
                && allowedInvokers.contains(email.trim().toLowerCase(Locale.ROOT));
    }

    private void authenticate(
            HttpServletRequest request,
            HttpServletResponse response,
            String principal,
            ServiceAuthentication.Method method) {
        ServiceAuthentication authentication = new ServiceAuthentication(principal, method);
        authentication.setDetails(detailsSource.buildDetails(request));
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);
    }

    private void reject(HttpServletRequest request, HttpServletResponse response, String message)
            throws IOException, ServletException {
        SecurityContextHolder.clearContext();
        entryPoint.commence(request, response, new InvalidBearerTokenException(message, null));
    }
}
