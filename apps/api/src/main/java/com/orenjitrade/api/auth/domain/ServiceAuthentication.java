package com.orenjitrade.api.auth.domain;

import java.util.List;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/**
 * Authentication of a trusted internal caller of {@code /internal/**} (Cloud Scheduler, Pub/Sub
 * push, the ML service): either the shared service token or a Google OIDC identity. Carries the
 * single authority {@value #AUTHORITY}.
 */
public final class ServiceAuthentication extends AbstractAuthenticationToken {

    private static final long serialVersionUID = 1L;

    public static final String ROLE = "SERVICE";
    public static final String AUTHORITY = "ROLE_" + ROLE;

    /** Principal name used when the shared token authenticated the call. */
    public static final String SERVICE_TOKEN_PRINCIPAL = "service-token";

    private final String principal;
    private final Method method;

    public ServiceAuthentication(String principal, Method method) {
        super(List.of(new SimpleGrantedAuthority(AUTHORITY)));
        this.principal = principal;
        this.method = method;
        setAuthenticated(true);
    }

    @Override
    public String getPrincipal() {
        return principal;
    }

    @Override
    public Object getCredentials() {
        return "";
    }

    @Override
    public String getName() {
        return principal;
    }

    public Method method() {
        return method;
    }

    /** How the caller authenticated. */
    public enum Method {
        SERVICE_TOKEN,
        OIDC
    }
}
