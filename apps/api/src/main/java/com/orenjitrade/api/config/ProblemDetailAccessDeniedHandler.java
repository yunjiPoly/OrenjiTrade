package com.orenjitrade.api.config;

import com.orenjitrade.api.auth.web.ReasonedAuthorizationDecision;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemDetailFactory;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

/**
 * Renders "authenticated but not allowed" as a 403 RFC 9457 problem with {@code errorCode
 * FORBIDDEN}, using the same factory as the MVC exception handler. A {@link
 * ReasonedAuthorizationDecision} (e.g. admin MFA missing) supplies a more specific message.
 */
@Component
public class ProblemDetailAccessDeniedHandler implements AccessDeniedHandler {

    static final String DEFAULT_MESSAGE = "You do not have permission to perform this action";

    private final ProblemDetailFactory problems;

    public ProblemDetailAccessDeniedHandler(ProblemDetailFactory problems) {
        this.problems = problems;
    }

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException accessDeniedException)
            throws IOException {
        String message = DEFAULT_MESSAGE;
        if (accessDeniedException instanceof AuthorizationDeniedException denied
                && denied.getAuthorizationResult()
                        instanceof ReasonedAuthorizationDecision reason) {
            message = reason.reason();
        }
        ProblemDetail detail =
                problems.create(
                        HttpStatus.FORBIDDEN,
                        ErrorCode.FORBIDDEN,
                        message,
                        null,
                        request.getRequestURI());
        problems.write(response, detail);
    }
}
