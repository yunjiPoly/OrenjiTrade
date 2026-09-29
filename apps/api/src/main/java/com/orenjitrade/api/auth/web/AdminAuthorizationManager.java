package com.orenjitrade.api.auth.web;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.UserAuthentication;
import java.util.function.Supplier;
import org.jspecify.annotations.Nullable;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

/**
 * Access rule of {@code /api/v1/admin/**}: the caller holds {@code ADMIN} or {@code SUPER_ADMIN}
 * and, when {@code orenji.security.admin.require-mfa} is on, authenticated with a second factor.
 */
public final class AdminAuthorizationManager
        implements AuthorizationManager<RequestAuthorizationContext> {

    public static final String MFA_REQUIRED_MESSAGE =
            "Multi-factor authentication is required for admin access";

    private final boolean requireMfa;

    public AdminAuthorizationManager(boolean requireMfa) {
        this.requireMfa = requireMfa;
    }

    @Override
    public @Nullable AuthorizationResult authorize(
            Supplier<? extends @Nullable Authentication> authentication,
            RequestAuthorizationContext context) {
        @Nullable Authentication current = authentication.get();
        if (!(current instanceof UserAuthentication userAuthentication)) {
            return new AuthorizationDecision(false);
        }
        AuthenticatedUser user = userAuthentication.user();
        if (!user.isAdmin()) {
            return new AuthorizationDecision(false);
        }
        if (requireMfa && !user.secondFactorUsed()) {
            return new ReasonedAuthorizationDecision(MFA_REQUIRED_MESSAGE);
        }
        return new AuthorizationDecision(true);
    }
}
