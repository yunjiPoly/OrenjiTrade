package com.orenjitrade.api.auth.web;

import org.jspecify.annotations.Nullable;
import org.springframework.security.core.AuthenticationException;

/**
 * Raised by the bearer token filter when a token is present but not acceptable. The message is
 * client-safe and becomes the problem {@code message}.
 */
public class InvalidBearerTokenException extends AuthenticationException {

    private static final long serialVersionUID = 1L;

    public InvalidBearerTokenException(String message, @Nullable Throwable cause) {
        super(message, cause);
    }
}
