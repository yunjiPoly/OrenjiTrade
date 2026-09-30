package com.orenjitrade.api.admin;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.auth.web.AdminAuthorizationManager;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;

/**
 * {@code orenji.security.admin.require-mfa=true} (the deployed default): admin routes need a second
 * factor. Separate context because the property differs from the shared test profile.
 */
@TestPropertySource(properties = "orenji.security.admin.require-mfa=true")
class AdminMfaIT extends AbstractIntegrationTest {

    @Test
    void adminWithoutSecondFactorIsForbiddenWithExplanation() {
        String uid = uniqueUid("mfa-admin");
        provisionWithRoles(uid, Role.ADMIN);

        http.get()
                .uri("/api/v1/admin/users")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isForbidden()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("FORBIDDEN")
                .jsonPath("$.message")
                .isEqualTo(AdminAuthorizationManager.MFA_REQUIRED_MESSAGE);
    }

    @Test
    void adminWithSecondFactorIsAllowed() {
        String uid = uniqueUid("mfa-admin-ok");
        provisionWithRoles(uid, Role.SUPER_ADMIN);

        http.get()
                .uri("/api/v1/admin/users")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid, "mfa"))
                .exchange()
                .expectStatus()
                .isOk();
    }

    @Test
    void plainUserWithSecondFactorIsStillForbidden() {
        String uid = uniqueUid("mfa-user");
        provisionCompliant(uid);

        http.get()
                .uri("/api/v1/admin/users")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid, "mfa"))
                .exchange()
                .expectStatus()
                .isForbidden();
    }
}
