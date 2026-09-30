package com.orenjitrade.api.common;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.net.URI;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationTrustResolver;
import org.springframework.security.authentication.AuthenticationTrustResolverImpl;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * The one {@code @RestControllerAdvice} of the application. Every exception that escapes a
 * controller becomes an RFC 9457 problem (see {@link ProblemDetailFactory} for the shape).
 *
 * <p>Rules: client-facing messages never contain stack traces, SQL, class names or other
 * infrastructure details; 5xx problems are logged at ERROR with the request id, 4xx problems at
 * DEBUG (WARN for data conflicts) so noisy clients do not flood the logs.
 *
 * <p>Exceptions raised by Spring MVC itself (unsupported media type, malformed JSON, unknown route,
 * upload too large, ...) are handled by the {@link ResponseEntityExceptionHandler} superclass and
 * enriched in {@link #createResponseEntity}; the overrides below only tune messages and codes.
 */
@RestControllerAdvice
public class ProblemDetailsExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ProblemDetailsExceptionHandler.class);

    private final ProblemDetailFactory problems;
    private final AuthenticationTrustResolver trustResolver = new AuthenticationTrustResolverImpl();

    public ProblemDetailsExceptionHandler(ProblemDetailFactory problems) {
        this.problems = problems;
    }

    // ---------------------------------------------------------------------------------------
    // Application exceptions
    // ---------------------------------------------------------------------------------------

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ProblemDetail> handleApiException(
            ApiException ex, HttpServletRequest request) {
        ProblemDetail detail =
                problems.create(
                        ex.getStatus(),
                        ex.getErrorCode(),
                        ex.getMessage(),
                        ex.getFieldErrors(),
                        request.getRequestURI());
        ex.getProperties().forEach(detail::setProperty);
        logProblem(ex, detail);
        return respond(detail);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ProblemDetail> handleConstraintViolation(
            ConstraintViolationException ex, HttpServletRequest request) {
        List<ProblemFieldError> errors =
                ex.getConstraintViolations().stream()
                        .map(
                                violation ->
                                        new ProblemFieldError(
                                                String.valueOf(violation.getPropertyPath()),
                                                violation.getMessage()))
                        .sorted(Comparator.comparing(ProblemFieldError::field))
                        .toList();
        ProblemDetail detail =
                problems.create(
                        HttpStatus.BAD_REQUEST,
                        ErrorCode.VALIDATION_FAILED,
                        "Validation failed",
                        errors,
                        request.getRequestURI());
        logProblem(ex, detail);
        return respond(detail);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ProblemDetail> handleDataIntegrityViolation(
            DataIntegrityViolationException ex, HttpServletRequest request) {
        ProblemDetail detail =
                problems.create(
                        HttpStatus.CONFLICT,
                        ErrorCode.CONFLICT,
                        "The request conflicts with the current state of the resource",
                        null,
                        request.getRequestURI());
        // The exception message contains SQL; it is fine in the logs, never in the response.
        log.warn(
                "Data integrity violation requestId={} path={}",
                requestIdOf(detail),
                request.getRequestURI(),
                ex);
        return respond(detail);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ProblemDetail> handleAccessDenied(
            AccessDeniedException ex, HttpServletRequest request) {
        @Nullable Authentication authentication =
                SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !trustResolver.isAuthenticated(authentication)) {
            return unauthenticated(ex, request);
        }
        ProblemDetail detail =
                problems.create(
                        HttpStatus.FORBIDDEN,
                        ErrorCode.FORBIDDEN,
                        "You do not have permission to perform this action",
                        null,
                        request.getRequestURI());
        logProblem(ex, detail);
        return respond(detail);
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ProblemDetail> handleAuthentication(
            AuthenticationException ex, HttpServletRequest request) {
        return unauthenticated(ex, request);
    }

    /** Catch-all: anything unexpected is a 500 with a generic message. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleUnexpected(
            Exception ex, HttpServletRequest request) {
        ProblemDetail detail =
                problems.create(
                        HttpStatus.INTERNAL_SERVER_ERROR,
                        ErrorCode.INTERNAL_ERROR,
                        "An unexpected error occurred",
                        null,
                        request.getRequestURI());
        logProblem(ex, detail);
        return respond(detail);
    }

    // ---------------------------------------------------------------------------------------
    // Spring MVC exceptions (superclass dispatches them here)
    // ---------------------------------------------------------------------------------------

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {
        List<ProblemFieldError> errors = new ArrayList<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            errors.add(new ProblemFieldError(fieldError.getField(), messageOf(fieldError)));
        }
        for (ObjectError globalError : ex.getBindingResult().getGlobalErrors()) {
            errors.add(new ProblemFieldError(globalError.getObjectName(), messageOf(globalError)));
        }
        errors.sort(Comparator.comparing(ProblemFieldError::field));
        return handleExceptionInternal(
                ex, validationProblem(status, errors, request), headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(
            HandlerMethodValidationException ex,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {
        List<ProblemFieldError> errors = new ArrayList<>();
        ex.getParameterValidationResults()
                .forEach(
                        result -> {
                            String parameter =
                                    result.getMethodParameter().getParameterName() != null
                                            ? result.getMethodParameter().getParameterName()
                                            : "parameter"
                                                    + result.getMethodParameter()
                                                            .getParameterIndex();
                            for (MessageSourceResolvable error : result.getResolvableErrors()) {
                                String field =
                                        error instanceof FieldError fieldError
                                                ? fieldError.getField()
                                                : parameter;
                                errors.add(new ProblemFieldError(field, messageOf(error)));
                            }
                        });
        errors.sort(Comparator.comparing(ProblemFieldError::field));
        return handleExceptionInternal(
                ex, validationProblem(status, errors, request), headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(
            HttpMessageNotReadableException ex,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {
        ProblemDetail detail =
                problems.create(
                        status,
                        ErrorCode.VALIDATION_FAILED,
                        "Request body is missing or malformed",
                        null,
                        pathOf(request));
        return handleExceptionInternal(ex, detail, headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleNoResourceFoundException(
            NoResourceFoundException ex,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {
        return handleExceptionInternal(
                ex, notFoundProblem(status, request), headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleNoHandlerFoundException(
            NoHandlerFoundException ex,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {
        return handleExceptionInternal(
                ex, notFoundProblem(status, request), headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleMaxUploadSizeExceededException(
            MaxUploadSizeExceededException ex,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {
        ProblemDetail detail =
                problems.create(
                        status,
                        ErrorCode.PAYLOAD_TOO_LARGE,
                        "The uploaded content exceeds the maximum allowed size",
                        null,
                        pathOf(request));
        return handleExceptionInternal(ex, detail, headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleHttpMediaTypeNotSupported(
            HttpMediaTypeNotSupportedException ex,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {
        if (!ex.getSupportedMediaTypes().isEmpty()) {
            headers.setAccept(ex.getSupportedMediaTypes());
        }
        ProblemDetail detail =
                problems.create(
                        status,
                        ErrorCode.UNSUPPORTED_MEDIA_TYPE,
                        "The request content type is not supported",
                        null,
                        pathOf(request));
        return handleExceptionInternal(ex, detail, headers, status, request);
    }

    /**
     * Logs framework-handled problems; the body itself is shaped in {@link #createResponseEntity}.
     */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception ex,
            @Nullable Object body,
            HttpHeaders headers,
            HttpStatusCode statusCode,
            WebRequest request) {
        ResponseEntity<Object> response =
                super.handleExceptionInternal(ex, body, headers, statusCode, request);
        if (response != null && response.getBody() instanceof ProblemDetail detail) {
            logProblem(ex, detail);
        } else if (statusCode.is5xxServerError()) {
            log.error(
                    "Request failed requestId={} status={} path={}",
                    problems.currentRequestId(),
                    statusCode.value(),
                    pathOf(request),
                    ex);
        }
        return response;
    }

    /**
     * Guarantees that every problem leaving this advice carries the OrenjiTrade extensions, even
     * for exceptions we do not override explicitly (method not allowed, type mismatch, ...).
     */
    @Override
    protected ResponseEntity<Object> createResponseEntity(
            @Nullable Object body,
            HttpHeaders headers,
            HttpStatusCode statusCode,
            WebRequest request) {
        if (body instanceof ProblemDetail detail) {
            if (detail.getProperties() == null
                    || !detail.getProperties().containsKey(ProblemDetailFactory.ERROR_CODE)) {
                problems.enrich(detail, ErrorCode.forStatus(statusCode), null, null);
            }
            if (detail.getInstance() == null) {
                detail.setInstance(URI.create(pathOf(request)));
            }
        }
        return super.createResponseEntity(body, headers, statusCode, request);
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private ResponseEntity<ProblemDetail> unauthenticated(
            Exception ex, HttpServletRequest request) {
        ProblemDetail detail =
                problems.create(
                        HttpStatus.UNAUTHORIZED,
                        ErrorCode.UNAUTHENTICATED,
                        "Authentication is required to access this resource",
                        null,
                        request.getRequestURI());
        logProblem(ex, detail);
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .header(HttpHeaders.WWW_AUTHENTICATE, "Bearer realm=\"OrenjiTrade\"")
                .body(detail);
    }

    private ProblemDetail validationProblem(
            HttpStatusCode status, List<ProblemFieldError> errors, WebRequest request) {
        return problems.create(
                status, ErrorCode.VALIDATION_FAILED, "Validation failed", errors, pathOf(request));
    }

    private ProblemDetail notFoundProblem(HttpStatusCode status, WebRequest request) {
        return problems.create(
                status,
                ErrorCode.NOT_FOUND,
                "The requested resource does not exist",
                null,
                pathOf(request));
    }

    private static ResponseEntity<ProblemDetail> respond(ProblemDetail detail) {
        return ResponseEntity.status(detail.getStatus()).body(detail);
    }

    private static String pathOf(WebRequest request) {
        if (request instanceof ServletWebRequest servletWebRequest) {
            return servletWebRequest.getRequest().getRequestURI();
        }
        return "";
    }

    private static String messageOf(MessageSourceResolvable error) {
        @Nullable String message = error.getDefaultMessage();
        return message != null ? message : "invalid value";
    }

    private static String requestIdOf(ProblemDetail detail) {
        return detail.getProperties() != null
                ? String.valueOf(detail.getProperties().get(ProblemDetailFactory.REQUEST_ID))
                : "unknown";
    }

    private void logProblem(Throwable ex, ProblemDetail detail) {
        String requestId = requestIdOf(detail);
        @Nullable Object errorCode =
                detail.getProperties() != null
                        ? detail.getProperties().get(ProblemDetailFactory.ERROR_CODE)
                        : null;
        if (detail.getStatus() >= 500) {
            log.error(
                    "Request failed requestId={} status={} errorCode={} path={}",
                    requestId,
                    detail.getStatus(),
                    errorCode,
                    detail.getInstance(),
                    ex);
        } else if (log.isDebugEnabled()) {
            log.debug(
                    "Request rejected requestId={} status={} errorCode={} path={} reason={}",
                    requestId,
                    detail.getStatus(),
                    errorCode,
                    detail.getInstance(),
                    ex.getMessage());
        }
    }
}
