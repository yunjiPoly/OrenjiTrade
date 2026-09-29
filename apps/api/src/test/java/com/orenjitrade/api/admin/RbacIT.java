package com.orenjitrade.api.admin;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/** Role-based access to {@code /api/v1/admin/**} and the role-grant rules. */
class RbacIT extends AbstractIntegrationTest {

    @Test
    void plainUserIsForbiddenOnAdminRoutes() {
        String uid = uniqueUid("rbac-user");
        provisionCompliant(uid);

        http.get()
                .uri("/api/v1/admin/users")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isForbidden()
                .expectHeader()
                .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("FORBIDDEN");

        http.get()
                .uri("/api/v1/admin/audit-logs")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isForbidden();
    }

    @Test
    void moderatorIsForbiddenOnAdminRoutes() {
        String uid = uniqueUid("rbac-mod");
        provisionWithRoles(uid, Role.MODERATOR);

        http.get()
                .uri("/api/v1/admin/users")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isForbidden();
    }

    @Test
    void adminWithoutMfaIsAllowedWhenMfaIsNotRequired() {
        String uid = uniqueUid("rbac-admin");
        provisionWithRoles(uid, Role.ADMIN);

        http.get()
                .uri("/api/v1/admin/users")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.items")
                .isArray()
                .jsonPath("$.page")
                .isEqualTo(0);
    }

    @Test
    void adminRoutesRequireAuthentication() {
        http.get().uri("/api/v1/admin/users").exchange().expectStatus().isUnauthorized();
    }

    @Test
    void adminCannotGrantPrivilegedRolesButCanGrantModerator() {
        String admin = uniqueUid("rbac-grant-admin");
        provisionWithRoles(admin, Role.ADMIN);
        String target = uniqueUid("rbac-target");
        UUID targetId = provisionCompliant(target);

        http.put()
                .uri("/api/v1/admin/users/{id}/roles", targetId)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("roles", List.of("USER", "ADMIN")))
                .exchange()
                .expectStatus()
                .isForbidden()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("FORBIDDEN");
        assertThat(testUsers.rolesOf(targetId)).containsExactly("USER");

        http.put()
                .uri("/api/v1/admin/users/{id}/roles", targetId)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("roles", List.of("MODERATOR", "PREMIUM_USER")))
                .exchange()
                .expectStatus()
                .isNoContent();
        assertThat(testUsers.rolesOf(targetId))
                .as("USER is always kept")
                .containsExactly("MODERATOR", "PREMIUM_USER", "USER");
        assertThat(me(target).path("roles").toString())
                .contains("MODERATOR")
                .contains("PREMIUM_USER")
                .contains("USER");
    }

    @Test
    void superAdminGrantsAndRevokesPrivilegedRoles() {
        String superAdmin = uniqueUid("rbac-super");
        provisionWithRoles(superAdmin, Role.SUPER_ADMIN);
        String target = uniqueUid("rbac-target2");
        UUID targetId = provisionCompliant(target);

        http.put()
                .uri("/api/v1/admin/users/{id}/roles", targetId)
                .header(HttpHeaders.AUTHORIZATION, bearer(superAdmin))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("roles", List.of("ADMIN")))
                .exchange()
                .expectStatus()
                .isNoContent();
        assertThat(testUsers.rolesOf(targetId)).containsExactly("ADMIN", "USER");

        // The new admin can now use admin routes (consents were accepted at provisioning).
        http.get()
                .uri("/api/v1/admin/users/{id}", targetId)
                .header(HttpHeaders.AUTHORIZATION, bearer(target))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.account.roles")
                .isArray();

        http.put()
                .uri("/api/v1/admin/users/{id}/roles", targetId)
                .header(HttpHeaders.AUTHORIZATION, bearer(superAdmin))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("roles", List.of()))
                .exchange()
                .expectStatus()
                .isNoContent();
        assertThat(testUsers.rolesOf(targetId)).containsExactly("USER");
        assertThat(testUsers.auditRowsFor(targetId))
                .extracting(row -> row.get("action"))
                .containsExactly("user.roles.update", "user.roles.update");
    }

    @Test
    void superAdminCannotRemoveOwnSuperAdminRole() {
        String superAdmin = uniqueUid("rbac-self");
        UUID id = provisionWithRoles(superAdmin, Role.SUPER_ADMIN);

        http.put()
                .uri("/api/v1/admin/users/{id}/roles", id)
                .header(HttpHeaders.AUTHORIZATION, bearer(superAdmin))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("roles", List.of("USER", "ADMIN")))
                .exchange()
                .expectStatus()
                .isEqualTo(409)
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("CONFLICT");
        assertThat(testUsers.rolesOf(id)).containsExactly("SUPER_ADMIN", "USER");
    }

    @Test
    void invalidRoleNameIsValidationFailure() {
        String superAdmin = uniqueUid("rbac-invalid");
        UUID id = provisionWithRoles(superAdmin, Role.SUPER_ADMIN);

        http.put()
                .uri("/api/v1/admin/users/{id}/roles", id)
                .header(HttpHeaders.AUTHORIZATION, bearer(superAdmin))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("roles", List.of("OVERLORD")))
                .exchange()
                .expectStatus()
                .isBadRequest()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void unknownUserIsNotFound() {
        String admin = uniqueUid("rbac-404");
        provisionWithRoles(admin, Role.ADMIN);

        http.get()
                .uri("/api/v1/admin/users/{id}", UUID.randomUUID())
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isNotFound()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("NOT_FOUND");
    }
}
