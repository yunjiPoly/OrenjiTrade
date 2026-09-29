package com.orenjitrade.api.auth.web;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.UserAuthentication;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemDetailFactory;
import com.orenjitrade.api.common.TimeProvider;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Central account-state enforcement, right after authentication:
 *
 * <ul>
 *   <li>{@code SUSPENDED} (and the suspension has not expired): 403 {@code ACCOUNT_SUSPENDED} on
 *       every non-public route, with the {@code suspendedUntil} extension when temporary;
 *   <li>{@code DELETION_REQUESTED}: only {@code GET /api/v1/me} and the deletion-request endpoints
 *       are allowed, everything else is 403 {@code ACCOUNT_SUSPENDED} "deletion pending";
 *   <li>{@code DELETED}: 403 {@code ACCOUNT_SUSPENDED}.
 * </ul>
 *
 * Public routes ({@code /api/v1/public/**}, {@code /api/v1/meta}, probes, docs) never need an
 * identity and are therefore not blocked even when a token is attached.
 */
public class AccountAccessFilter extends OncePerRequestFilter {

    static final String DELETION_PENDING_MESSAGE = "deletion pending";

    private final RequestMatcher publicRoutes;
    private final RequestMatcher deletionRequestedAllowed;
    private final ProblemDetailFactory problems;
    private final TimeProvider timeProvider;

    public AccountAccessFilter(
            List<String> publicPatterns, ProblemDetailFactory problems, TimeProvider timeProvider) {
        this.publicRoutes =
                new OrRequestMatcher(
                        publicPatterns.stream()
                                .map(
                                        pattern ->
                                                (RequestMatcher)
                                                        PathPatternRequestMatcher.pathPattern(
                                                                pattern))
                                .toList());
        this.deletionRequestedAllowed =
                new OrRequestMatcher(
                        PathPatternRequestMatcher.pathPattern(HttpMethod.GET, "/api/v1/me"),
                        PathPatternRequestMatcher.pathPattern("/api/v1/me/deletion-requests"),
                        PathPatternRequestMatcher.pathPattern("/api/v1/me/deletion-requests/**"));
        this.problems = problems;
        this.timeProvider = timeProvider;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!(authentication instanceof UserAuthentication userAuthentication)
                || publicRoutes.matches(request)) {
            chain.doFilter(request, response);
            return;
        }
        AuthenticatedUser user = userAuthentication.user();
        Instant now = timeProvider.now();
        if (user.isSuspendedAt(now)) {
            ProblemDetail detail = problem(request, "This account is suspended");
            if (user.suspendedUntil() != null) {
                detail.setProperty("suspendedUntil", user.suspendedUntil().toString());
            }
            problems.write(response, detail);
            return;
        }
        switch (user.status()) {
            case DELETION_REQUESTED -> {
                if (deletionRequestedAllowed.matches(request)) {
                    chain.doFilter(request, response);
                } else {
                    problems.write(response, problem(request, DELETION_PENDING_MESSAGE));
                }
            }
            case DELETED ->
                    problems.write(response, problem(request, "This account has been deleted"));
            default -> chain.doFilter(request, response);
        }
    }

    private ProblemDetail problem(HttpServletRequest request, String message) {
        return problems.create(
                HttpStatus.FORBIDDEN,
                ErrorCode.ACCOUNT_SUSPENDED,
                message,
                null,
                request.getRequestURI());
    }
}
