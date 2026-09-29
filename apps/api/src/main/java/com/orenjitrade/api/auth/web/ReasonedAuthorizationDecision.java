package com.orenjitrade.api.auth.web;

import org.springframework.security.authorization.AuthorizationDecision;

/** A denial that carries a client-safe explanation for the 403 problem {@code message}. */
public final class ReasonedAuthorizationDecision extends AuthorizationDecision {

    private final String reason;

    public ReasonedAuthorizationDecision(String reason) {
        super(false);
        this.reason = reason;
    }

    public String reason() {
        return reason;
    }
}
