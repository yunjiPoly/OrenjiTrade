package com.orenjitrade.api.common;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

/**
 * Reads the body of a {@code PATCH} request ("any subset of the fields"): distinguishes an absent
 * member (unchanged) from an explicit {@code null} (cleared) and collects type errors as {@code 400
 * VALIDATION_FAILED} field errors. Unknown members are ignored (clients must tolerate additive
 * changes, and so does the server).
 */
public final class PartialUpdate {

    private final JsonNode body;
    private final List<ProblemFieldError> errors = new ArrayList<>();

    private PartialUpdate(JsonNode body) {
        this.body = body;
    }

    /** Wraps a request body; {@code 400} unless it is a JSON object. */
    public static PartialUpdate of(@Nullable JsonNode body) {
        if (body == null || !body.isObject()) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("body", "must be a JSON object")));
        }
        return new PartialUpdate(body);
    }

    /** Whether the member is present (possibly {@code null}). */
    public boolean has(String field) {
        return body.has(field);
    }

    /** Whether the member is present and not {@code null}. */
    public boolean hasValue(String field) {
        return body.has(field) && !body.get(field).isNull();
    }

    /** Records an error when the member is present but {@code null}. */
    public PartialUpdate notNull(String... fields) {
        for (String field : fields) {
            if (body.has(field) && body.get(field).isNull()) {
                errors.add(new ProblemFieldError(field, "must not be null"));
            }
        }
        return this;
    }

    public @Nullable String text(String field) {
        JsonNode node = value(field);
        if (node == null) {
            return null;
        }
        if (!node.isString()) {
            errors.add(new ProblemFieldError(field, "must be a string"));
            return null;
        }
        return node.stringValue();
    }

    public @Nullable Integer integer(String field) {
        JsonNode node = value(field);
        if (node == null) {
            return null;
        }
        if (!node.isIntegralNumber() || !node.canConvertToInt()) {
            errors.add(new ProblemFieldError(field, "must be an integer"));
            return null;
        }
        return node.intValue();
    }

    public @Nullable BigDecimal decimal(String field) {
        JsonNode node = value(field);
        if (node == null) {
            return null;
        }
        if (!node.isNumber()) {
            errors.add(new ProblemFieldError(field, "must be a number"));
            return null;
        }
        return node.decimalValue();
    }

    public @Nullable Boolean bool(String field) {
        JsonNode node = value(field);
        if (node == null) {
            return null;
        }
        if (!node.isBoolean()) {
            errors.add(new ProblemFieldError(field, "must be true or false"));
            return null;
        }
        return node.booleanValue();
    }

    public @Nullable UUID uuid(String field) {
        @Nullable String text = text(field);
        if (text == null) {
            return null;
        }
        try {
            return UUID.fromString(text.trim());
        } catch (IllegalArgumentException e) {
            errors.add(new ProblemFieldError(field, "must be a UUID"));
            return null;
        }
    }

    public @Nullable Instant instant(String field) {
        @Nullable String text = text(field);
        if (text == null) {
            return null;
        }
        try {
            return Instant.parse(text.trim());
        } catch (DateTimeParseException e) {
            errors.add(new ProblemFieldError(field, "must be an ISO-8601 date-time"));
            return null;
        }
    }

    public <E extends Enum<E>> @Nullable E enumValue(String field, Class<E> type) {
        @Nullable String text = text(field);
        if (text == null) {
            return null;
        }
        try {
            return Enum.valueOf(type, text.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            errors.add(new ProblemFieldError(field, "unknown value"));
            return null;
        }
    }

    /** Adds an error found by the caller. */
    public void reject(String field, String message) {
        errors.add(new ProblemFieldError(field, message));
    }

    /** {@code 400 VALIDATION_FAILED} with every error collected so far. */
    public void throwIfInvalid() {
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
    }

    private @Nullable JsonNode value(String field) {
        JsonNode node = body.get(field);
        return node == null || node.isNull() ? null : node;
    }
}
