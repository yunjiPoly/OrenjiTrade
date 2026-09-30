package com.orenjitrade.api.common;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;

/**
 * Business exception translated to an RFC 9457 problem response by {@link
 * ProblemDetailsExceptionHandler}.
 *
 * <p>The {@code message} is sent to clients verbatim, so it must be safe: describe what went wrong
 * for the caller, never internal state, SQL, class names or stack details.
 */
public class ApiException extends RuntimeException {

    private final ErrorCode errorCode;
    private final HttpStatus status;
    private final List<ProblemFieldError> fieldErrors;
    private final Map<String, Object> properties = new LinkedHashMap<>();

    public ApiException(ErrorCode errorCode, String message) {
        this(errorCode, errorCode.defaultStatus(), message, List.of(), null);
    }

    public ApiException(ErrorCode errorCode, HttpStatus status, String message) {
        this(errorCode, status, message, List.of(), null);
    }

    public ApiException(
            ErrorCode errorCode,
            HttpStatus status,
            String message,
            List<ProblemFieldError> fieldErrors,
            @Nullable Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
        this.status = status;
        this.fieldErrors = List.copyOf(fieldErrors);
    }

    /** 404 with {@link ErrorCode#NOT_FOUND}. */
    public static ApiException notFound(String message) {
        return new ApiException(ErrorCode.NOT_FOUND, message);
    }

    /** 403 with {@link ErrorCode#FORBIDDEN}. */
    public static ApiException forbidden(String message) {
        return new ApiException(ErrorCode.FORBIDDEN, message);
    }

    /** 409 with {@link ErrorCode#CONFLICT}. */
    public static ApiException conflict(String message) {
        return new ApiException(ErrorCode.CONFLICT, message);
    }

    /** 400 with {@link ErrorCode#VALIDATION_FAILED} and per-field errors. */
    public static ApiException validation(String message, List<ProblemFieldError> fieldErrors) {
        return new ApiException(
                ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, message, fieldErrors, null);
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }

    public HttpStatus getStatus() {
        return status;
    }

    /** Never null; empty unless the exception describes validation failures. */
    public List<ProblemFieldError> getFieldErrors() {
        return fieldErrors;
    }

    /**
     * Adds a client-safe extension member to the problem document (for example {@code blockers} of
     * {@code DELETION_BLOCKED}). Must be documented in the OpenAPI {@code ProblemDetail} schema.
     */
    public ApiException withProperty(String name, Object value) {
        properties.put(name, value);
        return this;
    }

    /** Extension members added through {@link #withProperty}; never null. */
    public Map<String, Object> getProperties() {
        return Map.copyOf(properties);
    }
}
