package com.orenjitrade.api.common;

import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.webmvc.error.ErrorController;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Replaces Spring Boot's {@code BasicErrorController} so that errors which never reach a controller
 * (failures inside servlet filters, container-level errors) are still rendered as RFC 9457 problems
 * instead of Boot's default {@code {timestamp,status,error,path}} document.
 */
@RestController
@Hidden // servlet-container error dispatch target, not part of the public contract
public class ProblemDetailErrorController implements ErrorController {

    private static final Logger log = LoggerFactory.getLogger(ProblemDetailErrorController.class);

    private final ProblemDetailFactory problems;

    public ProblemDetailErrorController(ProblemDetailFactory problems) {
        this.problems = problems;
    }

    @RequestMapping("${spring.web.error.path:${server.error.path:/error}}")
    public ResponseEntity<ProblemDetail> error(HttpServletRequest request) {
        HttpStatus status = statusOf(request);
        ErrorCode errorCode = ErrorCode.forStatus(status);
        String message =
                switch (errorCode) {
                    case NOT_FOUND -> "The requested resource does not exist";
                    case UNAUTHENTICATED -> "Authentication is required to access this resource";
                    case FORBIDDEN -> "You do not have permission to perform this action";
                    default ->
                            status.is5xxServerError()
                                    ? "An unexpected error occurred"
                                    : "The request could not be processed";
                };
        ProblemDetail detail =
                problems.create(status, errorCode, message, null, originalPath(request));
        if (status.is5xxServerError()) {
            @Nullable Object exception = request.getAttribute(RequestDispatcher.ERROR_EXCEPTION);
            log.error(
                    "Request failed before reaching a controller requestId={} status={} path={}",
                    problems.currentRequestId(),
                    status.value(),
                    originalPath(request),
                    exception instanceof Throwable throwable ? throwable : null);
        }
        return ResponseEntity.status(status).body(detail);
    }

    private static HttpStatus statusOf(HttpServletRequest request) {
        @Nullable Object statusCode = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
        if (statusCode instanceof Integer code) {
            @Nullable HttpStatus resolved = HttpStatus.resolve(code);
            if (resolved != null) {
                return resolved;
            }
        }
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    private static @Nullable String originalPath(HttpServletRequest request) {
        @Nullable Object uri = request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI);
        return uri instanceof String path ? path : request.getRequestURI();
    }
}
