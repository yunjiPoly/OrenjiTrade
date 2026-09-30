package com.orenjitrade.api.config;

import com.orenjitrade.api.auth.web.InvalidBearerTokenException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemDetailFactory;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

/**
 * Renders "no or invalid credentials" as a 401 RFC 9457 problem with {@code errorCode
 * UNAUTHENTICATED}, using the same factory as the MVC exception handler. A rejected bearer token
 * ({@link InvalidBearerTokenException}) keeps its client-safe explanation and adds the {@code
 * error="invalid_token"} hint to {@code WWW-Authenticate} (RFC 6750).
 */
@Component
public class ProblemDetailAuthenticationEntryPoint implements AuthenticationEntryPoint {

    static final String DEFAULT_MESSAGE = "Authentication is required to access this resource";
    static final String CHALLENGE = "Bearer realm=\"OrenjiTrade\"";
    static final String INVALID_TOKEN_CHALLENGE = CHALLENGE + ", error=\"invalid_token\"";

    private final ProblemDetailFactory problems;

    public ProblemDetailAuthenticationEntryPoint(ProblemDetailFactory problems) {
        this.problems = problems;
    }

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authException)
            throws IOException {
        boolean invalidToken = authException instanceof InvalidBearerTokenException;
        String message =
                invalidToken && authException.getMessage() != null
                        ? authException.getMessage()
                        : DEFAULT_MESSAGE;
        ProblemDetail detail =
                problems.create(
                        HttpStatus.UNAUTHORIZED,
                        ErrorCode.UNAUTHENTICATED,
                        message,
                        null,
                        request.getRequestURI());
        response.setHeader(
                HttpHeaders.WWW_AUTHENTICATE, invalidToken ? INVALID_TOKEN_CHALLENGE : CHALLENGE);
        problems.write(response, detail);
    }
}
