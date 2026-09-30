package com.orenjitrade.api.auth.domain;

import org.jspecify.annotations.Nullable;

/**
 * The presented ID token cannot be accepted. The message is client-safe (it is rendered in the 401
 * problem) and never contains the token.
 */
public class InvalidIdentityTokenException extends RuntimeException {

    public InvalidIdentityTokenException(String message) {
        super(message);
    }

    public InvalidIdentityTokenException(String message, @Nullable Throwable cause) {
        super(message, cause);
    }
}
