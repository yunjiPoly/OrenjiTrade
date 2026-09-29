package com.orenjitrade.api.users.web;

import com.orenjitrade.api.auth.domain.UserAuthentication;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemDetailFactory;
import com.orenjitrade.api.users.domain.ConsentService;
import com.orenjitrade.api.users.domain.RequiredConsent;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.server.PathContainer;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

/**
 * Answers {@code 428 TERMS_ACCEPTANCE_REQUIRED} (with the {@code requiredConsents[]} extension) on
 * every authenticated {@code /api/**} route while the caller still has to accept a current legal
 * document, except the routes the contract exempts so clients can recover: {@code /me}, {@code
 * /me/consents}, {@code /me/deletion-requests}, {@code /public/**} and {@code /meta}. Runs after
 * authorization so RBAC denials keep winning over the terms check.
 */
public class TermsEnforcementFilter extends OncePerRequestFilter {

    public static final String REQUIRED_CONSENTS = "requiredConsents";

    static final List<String> EXEMPT_PATTERNS =
            List.of(
                    "/api/v1/me",
                    "/api/v1/me/consents",
                    "/api/v1/me/deletion-requests",
                    "/api/v1/me/deletion-requests/**",
                    "/api/v1/public/**",
                    "/api/v1/meta");

    private static final String ENFORCED_PREFIX = "/api/";
    private static final List<PathPattern> EXEMPT = compile(EXEMPT_PATTERNS);

    private final ConsentService consentService;
    private final ProblemDetailFactory problems;

    public TermsEnforcementFilter(ConsentService consentService, ProblemDetailFactory problems) {
        this.consentService = consentService;
        this.problems = problems;
    }

    /** Whether the terms check applies to a request path (public for the unit test). */
    public static boolean isEnforced(String path) {
        if (!path.startsWith(ENFORCED_PREFIX)) {
            return false;
        }
        PathContainer container = PathContainer.parsePath(path);
        for (PathPattern pattern : EXEMPT) {
            if (pattern.matches(container)) {
                return false;
            }
        }
        return true;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !isEnforced(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        @Nullable Authentication authentication =
                SecurityContextHolder.getContext().getAuthentication();
        if (!(authentication instanceof UserAuthentication user)) {
            chain.doFilter(request, response);
            return;
        }
        List<RequiredConsent> required = consentService.requiredConsents(user.user().userId());
        if (required.isEmpty()) {
            chain.doFilter(request, response);
            return;
        }
        ProblemDetail detail =
                problems.create(
                        HttpStatus.PRECONDITION_REQUIRED,
                        ErrorCode.TERMS_ACCEPTANCE_REQUIRED,
                        "The current terms must be accepted before using this resource",
                        null,
                        request.getRequestURI());
        detail.setProperty(REQUIRED_CONSENTS, required);
        problems.write(response, detail);
    }

    private static List<PathPattern> compile(List<String> patterns) {
        PathPatternParser parser = new PathPatternParser();
        return patterns.stream().map(parser::parse).toList();
    }
}
