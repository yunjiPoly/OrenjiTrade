package com.orenjitrade.api.auth.domain;

import org.jspecify.annotations.Nullable;

/** The identity provider rejected an administrative operation or was unreachable. */
public class IdentityAdminException extends RuntimeException {

    public IdentityAdminException(String message, @Nullable Throwable cause) {
        super(message, cause);
    }
}
