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
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
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
 *   <li>{@code DELETION_REQUESTED}: only {@code GET /api/v1/me}, {@code GET /api/v1/me/export} and
 *       the deletion-request endpoints are allowed, everything else is 403 {@code
 *       ACCOUNT_SUSPENDED} "deletion pending";
 *   <li>{@code DELETED}: 403 {@code ACCOUNT_SUSPENDED}.
 * </ul>
 *
 * Public routes ({@code /api/v1/public/**}, {@code /api/v1/meta}, probes, docs, and the read-only
 * catalog GET routes) never need an identity and are therefore not blocked even when a token is
 * attached. An account refused above reads them as a signed-out visitor (a guest: places, never
 * who; the guests' rate limits): its token is dropped for the request, so a suspension that leaves
 * the login on (owner decision of 2026-10-28) never lets the account read members-only details.
 */
public class AccountAccessFilter extends OncePerRequestFilter {

    static final String DELETION_PENDING_MESSAGE = "deletion pending";

    /** Key of the guest authentication that replaces a refused account on public routes. */
    private static final String GUEST_KEY = AccountAccessFilter.class.getName();

    private final RequestMatcher publicRoutes;
    private final RequestMatcher deletionRequestedAllowed;
    private final ProblemDetailFactory problems;
    private final TimeProvider timeProvider;
    private final SecurityContextRepository contextRepository =
            new RequestAttributeSecurityContextRepository();

    public AccountAccessFilter(
            List<String> publicPatterns, ProblemDetailFactory problems, TimeProvider timeProvider) {
        this(publicPatterns, List.of(), problems, timeProvider);
    }

    /**
     * @param publicPatterns routes public for every method
     * @param publicGetPatterns routes public for GET only (read-only catalog)
     */
    public AccountAccessFilter(
            List<String> publicPatterns,
            List<String> publicGetPatterns,
            ProblemDetailFactory problems,
            TimeProvider timeProvider) {
        List<RequestMatcher> matchers = new ArrayList<>();
        publicPatterns.forEach(
                pattern -> matchers.add(PathPatternRequestMatcher.pathPattern(pattern)));
        publicGetPatterns.forEach(
                pattern ->
                        matchers.add(
                                PathPatternRequestMatcher.pathPattern(HttpMethod.GET, pattern)));
        this.publicRoutes = new OrRequestMatcher(matchers);
        this.deletionRequestedAllowed =
                new OrRequestMatcher(
                        PathPatternRequestMatcher.pathPattern(HttpMethod.GET, "/api/v1/me"),
                        PathPatternRequestMatcher.pathPattern(HttpMethod.GET, "/api/v1/me/export"),
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
        if (!(authentication instanceof UserAuthentication userAuthentication)) {
            chain.doFilter(request, response);
            return;
        }
        AuthenticatedUser user = userAuthentication.user();
        Instant now = timeProvider.now();
        if (publicRoutes.matches(request)) {
            if (isRefusedAt(user, now)) {
                browseAsGuest(request, response);
            }
            chain.doFilter(request, response);
            return;
        }
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

    /**
     * Whether the account is refused on member routes: a suspension in force, a deletion pending
     * (outside its own few routes) or a deleted account.
     */
    static boolean isRefusedAt(AuthenticatedUser user, Instant now) {
        return user.isSuspendedAt(now)
                || switch (user.status()) {
                    case DELETION_REQUESTED, DELETED -> true;
                    default -> false;
                };
    }

    /**
     * Replaces the refused account with a guest for this request (the same anonymous authentication
     * a request without a token gets), also for an error dispatch of the request.
     */
    private void browseAsGuest(HttpServletRequest request, HttpServletResponse response) {
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(
                new AnonymousAuthenticationToken(
                        GUEST_KEY,
                        "anonymousUser",
                        AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS")));
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);
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
