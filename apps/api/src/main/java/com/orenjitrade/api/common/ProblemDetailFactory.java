package com.orenjitrade.api.common;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * The single place that shapes RFC 9457 problem responses. Used by {@link
 * ProblemDetailsExceptionHandler} for exceptions raised inside Spring MVC and by the Spring
 * Security entry point / access-denied handler for failures that happen before a controller is
 * reached, so every error the API emits has the same shape:
 *
 * <pre>{@code
 * {
 *   "type": "https://api.orenjitrade.com/problems/not-found",
 *   "title": "Not found",
 *   "status": 404,
 *   "detail": "Card not found",
 *   "instance": "/api/v1/cards/42",
 *   "errorCode": "NOT_FOUND",
 *   "message": "Card not found",
 *   "requestId": "9f0d4c2e-...",
 *   "timestamp": "2026-09-29T10:15:30.123456Z",
 *   "errors": [ { "field": "name", "message": "must not be blank" } ]
 * }
 * }</pre>
 */
@Component
public class ProblemDetailFactory {

    public static final String ERROR_CODE = "errorCode";
    public static final String MESSAGE = "message";
    public static final String REQUEST_ID = "requestId";
    public static final String TIMESTAMP = "timestamp";
    public static final String ERRORS = "errors";

    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public ProblemDetailFactory(TimeProvider timeProvider, JsonMapper jsonMapper) {
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
    }

    /**
     * Creates a fully populated problem.
     *
     * @param status HTTP status of the response
     * @param errorCode stable error code
     * @param message client-safe explanation (becomes {@code detail} and {@code message})
     * @param errors optional per-field validation errors
     * @param instancePath optional request path used as {@code instance}
     */
    public ProblemDetail create(
            HttpStatusCode status,
            ErrorCode errorCode,
            String message,
            @Nullable List<ProblemFieldError> errors,
            @Nullable String instancePath) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(status, message);
        if (instancePath != null && !instancePath.isBlank()) {
            detail.setInstance(URI.create(instancePath));
        }
        return enrich(detail, errorCode, message, errors);
    }

    /**
     * Adds the OrenjiTrade extension properties (and a stable {@code type}/{@code title}) to a
     * problem that the framework already produced. {@code message} defaults to the existing {@code
     * detail}, which Spring keeps free of internal information.
     */
    public ProblemDetail enrich(
            ProblemDetail detail,
            ErrorCode errorCode,
            @Nullable String message,
            @Nullable List<ProblemFieldError> errors) {
        if (detail.getType() == null || "about:blank".equals(detail.getType().toString())) {
            detail.setType(URI.create(errorCode.problemType()));
        }
        if (isDefaultTitle(detail)) {
            detail.setTitle(errorCode.title());
        }
        String safeMessage =
                message != null
                        ? message
                        : (detail.getDetail() != null ? detail.getDetail() : errorCode.title());
        if (detail.getDetail() == null) {
            detail.setDetail(safeMessage);
        }
        detail.setProperty(ERROR_CODE, errorCode.name());
        detail.setProperty(MESSAGE, safeMessage);
        detail.setProperty(REQUEST_ID, currentRequestId());
        detail.setProperty(TIMESTAMP, timeProvider.now().toString());
        if (errors != null && !errors.isEmpty()) {
            detail.setProperty(ERRORS, List.copyOf(errors));
        }
        return detail;
    }

    /**
     * Whether the title is absent or the HTTP reason phrase that {@link
     * ProblemDetail#forStatus(HttpStatusCode)} assigns ("Not Found"), in which case the error code
     * title replaces it.
     */
    private static boolean isDefaultTitle(ProblemDetail detail) {
        @Nullable String title = detail.getTitle();
        if (title == null || title.isBlank()) {
            return true;
        }
        @Nullable HttpStatus status = HttpStatus.resolve(detail.getStatus());
        return status != null && status.getReasonPhrase().equals(title);
    }

    /** The request id of the current thread (put there by {@link RequestIdFilter}). */
    public String currentRequestId() {
        @Nullable String requestId = MDC.get(RequestIdFilter.MDC_KEY);
        return requestId != null ? requestId : UUID.randomUUID().toString();
    }

    /**
     * Flattens a problem into the JSON structure defined by RFC 9457: the standard members first,
     * then every extension property at the top level. Independent of Jackson mix-in registration so
     * the security handlers produce exactly the same document as Spring MVC.
     */
    public Map<String, Object> toJsonMap(ProblemDetail detail) {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("type", detail.getType() != null ? detail.getType().toString() : "about:blank");
        if (detail.getTitle() != null) {
            json.put("title", detail.getTitle());
        }
        json.put("status", detail.getStatus());
        if (detail.getDetail() != null) {
            json.put("detail", detail.getDetail());
        }
        if (detail.getInstance() != null) {
            json.put("instance", detail.getInstance().toString());
        }
        Map<String, Object> properties = detail.getProperties();
        if (properties != null) {
            properties.forEach(
                    (key, value) -> {
                        if (value != null) {
                            json.put(key, value);
                        }
                    });
        }
        return json;
    }

    /** Writes the problem as {@code application/problem+json} directly to a servlet response. */
    public void write(HttpServletResponse response, ProblemDetail detail) throws IOException {
        response.setStatus(detail.getStatus());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.getWriter().write(jsonMapper.writeValueAsString(toJsonMap(detail)));
        response.getWriter().flush();
    }
}
