package com.orenjitrade.api.auth.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.auth.domain.ServiceAuthentication;
import com.orenjitrade.api.auth.domain.UserAuthentication;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

class AdminAuthorizationManagerTest {

    private static final RequestAuthorizationContext CONTEXT =
            new RequestAuthorizationContext(
                    new MockHttpServletRequest("GET", "/api/v1/admin/users"));

    @Test
    void adminAndSuperAdminAreGrantedWhenMfaIsNotRequired() {
        AdminAuthorizationManager manager = new AdminAuthorizationManager(false);

        assertThat(granted(manager, user(false, Role.ADMIN))).isTrue();
        assertThat(granted(manager, user(false, Role.SUPER_ADMIN))).isTrue();
        assertThat(granted(manager, user(false, Role.USER))).isFalse();
        assertThat(granted(manager, user(false, Role.MODERATOR))).isFalse();
    }

    @Test
    void mfaRequirementDeniesWithReason() {
        AdminAuthorizationManager manager = new AdminAuthorizationManager(true);

        AuthorizationResult withoutMfa = manager.authorize(() -> user(false, Role.ADMIN), CONTEXT);
        assertThat(withoutMfa).isInstanceOf(ReasonedAuthorizationDecision.class);
        assertThat(withoutMfa.isGranted()).isFalse();
        assertThat(((ReasonedAuthorizationDecision) withoutMfa).reason())
                .isEqualTo(AdminAuthorizationManager.MFA_REQUIRED_MESSAGE);

        assertThat(granted(manager, user(true, Role.ADMIN))).isTrue();
        AuthorizationResult plainUser = manager.authorize(() -> user(true, Role.USER), CONTEXT);
        assertThat(plainUser.isGranted()).isFalse();
        assertThat(plainUser).isNotInstanceOf(ReasonedAuthorizationDecision.class);
    }

    @Test
    void nonUserPrincipalsAreDenied() {
        AdminAuthorizationManager manager = new AdminAuthorizationManager(false);
        Authentication anonymous =
                new AnonymousAuthenticationToken(
                        "key",
                        "anonymousUser",
                        AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS"));
        Authentication service =
                new ServiceAuthentication("svc", ServiceAuthentication.Method.SERVICE_TOKEN);

        assertThat(manager.authorize(() -> anonymous, CONTEXT).isGranted()).isFalse();
        assertThat(manager.authorize(() -> service, CONTEXT).isGranted()).isFalse();
        assertThat(manager.authorize(() -> null, CONTEXT).isGranted()).isFalse();
    }

    private static boolean granted(AdminAuthorizationManager manager, Authentication auth) {
        AuthorizationResult result = manager.authorize(() -> auth, CONTEXT);
        return result != null && result.isGranted();
    }

    private static UserAuthentication user(boolean mfa, Role... roles) {
        return new UserAuthentication(
                new AuthenticatedUser(
                        UUID.randomUUID(),
                        "uid",
                        "u@example.test",
                        true,
                        "handle",
                        Set.of(roles),
                        AccountStatus.ACTIVE,
                        null,
                        Instant.parse("2026-09-29T12:00:00Z"),
                        mfa));
    }
}
