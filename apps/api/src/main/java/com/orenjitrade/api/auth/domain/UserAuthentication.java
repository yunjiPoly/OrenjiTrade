package com.orenjitrade.api.auth.domain;

import java.util.List;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/**
 * Spring Security {@link org.springframework.security.core.Authentication} of a collector. The
 * authorities are {@code ROLE_<role>} for every role of the account; the credentials are never kept
 * (the bearer token is not stored anywhere after verification).
 */
public final class UserAuthentication extends AbstractAuthenticationToken {

    private static final long serialVersionUID = 1L;

    private final AuthenticatedUser user;

    public UserAuthentication(AuthenticatedUser user) {
        super(authoritiesOf(user));
        this.user = user;
        setAuthenticated(true);
    }

    private static List<GrantedAuthority> authoritiesOf(AuthenticatedUser user) {
        return user.roles().stream()
                .sorted()
                .map(role -> (GrantedAuthority) new SimpleGrantedAuthority(role.authority()))
                .toList();
    }

    public AuthenticatedUser user() {
        return user;
    }

    @Override
    public AuthenticatedUser getPrincipal() {
        return user;
    }

    @Override
    public Object getCredentials() {
        return "";
    }

    @Override
    public String getName() {
        return user.getName();
    }
}
