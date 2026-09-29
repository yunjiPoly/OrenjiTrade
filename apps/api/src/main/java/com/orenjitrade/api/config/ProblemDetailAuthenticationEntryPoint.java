package com.orenjitrade.api.config;

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
 * UNAUTHENTICATED}, using the same factory as the MVC exception handler.
 */
@Component
public class ProblemDetailAuthenticationEntryPoint implements AuthenticationEntryPoint {

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
        ProblemDetail detail =
                problems.create(
                        HttpStatus.UNAUTHORIZED,
                        ErrorCode.UNAUTHENTICATED,
                        "Authentication is required to access this resource",
                        null,
                        request.getRequestURI());
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer realm=\"OrenjiTrade\"");
        problems.write(response, detail);
    }
}
