package com.orenjitrade.api.admin;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.auth.infra.NoopIdentityAdminClient;
import com.orenjitrade.api.common.RequestIdFilter;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/** Audit entries written by admin actions and the admin audit-log query. */
class AuditIT extends AbstractIntegrationTest {

    @Autowired private NoopIdentityAdminClient identityAdminClient;

    @Test
    void suspendWritesAuditRowWithRequestIdAndDisablesIdentity() {
        String admin = uniqueUid("audit-admin");
        UUID adminId = provisionWithRoles(admin, Role.ADMIN);
        String target = uniqueUid("audit-target");
        UUID targetId = provisionCompliant(target);
        String requestId = "audit-it-" + uniqueUid("req");
        Instant until = Instant.now().plusSeconds(7200).truncatedTo(ChronoUnit.MICROS);

        http.post()
                .uri("/api/v1/admin/users/{id}/suspend", targetId)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .header(RequestIdFilter.HEADER, requestId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("reason", "Repeated spam reports", "until", until.toString()))
                .exchange()
                .expectStatus()
                .isNoContent()
                .expectHeader()
                .valueEquals(RequestIdFilter.HEADER, requestId);

        List<Map<String, Object>> rows = testUsers.auditRowsFor(targetId);
        assertThat(rows).hasSize(1);
        Map<String, Object> row = rows.get(0);
        assertThat(row.get("action")).isEqualTo("user.suspend");
        assertThat(row.get("actor_type")).isEqualTo("ADMIN");
        assertThat(row.get("actor_user_id")).isEqualTo(adminId);
        assertThat(row.get("request_id")).isEqualTo(requestId);
        assertThat(String.valueOf(row.get("details")))
                .contains("\"reason\"")
                .contains("Repeated spam reports")
                .contains("\"previousStatus\"");
        assertThat(identityAdminClient.isDisabled(target)).isTrue();

        // The suspended user is blocked; the admin sees the suspension in the detail view.
        http.get()
                .uri("/api/v1/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(target))
                .exchange()
                .expectStatus()
                .isForbidden()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("ACCOUNT_SUSPENDED");
        http.get()
                .uri("/api/v1/admin/users/{id}", targetId)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.account.status")
                .isEqualTo("SUSPENDED")
                .jsonPath("$.account.suspendedUntil")
                .isEqualTo(until.toString())
                .jsonPath("$.suspensionReason")
                .isEqualTo("Repeated spam reports")
                .jsonPath("$.recentAuditEntries[0].action")
                .isEqualTo("user.suspend")
                .jsonPath("$.recentAuditEntries[0].requestId")
                .isEqualTo(requestId)
                .jsonPath("$.recentAuditEntries[0].actor.id")
                .isEqualTo(adminId.toString())
                .jsonPath("$.locationLabel")
                .isEqualTo("Quebec, Canada")
                .jsonPath("$.deletionRequest")
                .value(request -> assertThat(request).isNull());

        // Unsuspend re-enables the identity and the account.
        http.post()
                .uri("/api/v1/admin/users/{id}/unsuspend", targetId)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isNoContent();
        assertThat(identityAdminClient.isDisabled(target)).isFalse();
        assertThat(me(target).path("status").asString()).isEqualTo("ACTIVE");
        assertThat(testUsers.auditRowsFor(targetId))
                .extracting(r -> r.get("action"))
                .containsExactly("user.suspend", "user.unsuspend");

        // Unsuspending an active account is a conflict.
        http.post()
                .uri("/api/v1/admin/users/{id}/unsuspend", targetId)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isEqualTo(409);
    }

    @Test
    void adminAuditLogQueryFilters() {
        String admin = uniqueUid("audit-query-admin");
        UUID adminId = provisionWithRoles(admin, Role.ADMIN);
        String target = uniqueUid("audit-query-target");
        UUID targetId = provisionCompliant(target);
        Instant before = Instant.now().minusSeconds(5);

        http.post()
                .uri("/api/v1/admin/users/{id}/suspend", targetId)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("reason", "audit query test"))
                .exchange()
                .expectStatus()
                .isNoContent();
        http.post()
                .uri("/api/v1/admin/users/{id}/unsuspend", targetId)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isNoContent();

        String adminHandle = me(admin).path("handle").asString();

        http.get()
                .uri(
                        "/api/v1/admin/audit-logs?targetType=USER&targetId={id}&page=0&size=10",
                        targetId)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.totalItems")
                .isEqualTo(2)
                .jsonPath("$.items[0].action")
                .isEqualTo("user.unsuspend")
                .jsonPath("$.items[1].action")
                .isEqualTo("user.suspend")
                .jsonPath("$.items[1].details.reason")
                .isEqualTo("audit query test")
                .jsonPath("$.items[1].actor.id")
                .isEqualTo(adminId.toString())
                .jsonPath("$.items[1].actor.handle")
                .isEqualTo(adminHandle)
                .jsonPath("$.items[1].actor.type")
                .isEqualTo("ADMIN")
                .jsonPath("$.items[1].targetType")
                .isEqualTo("USER")
                .jsonPath("$.items[1].targetId")
                .isEqualTo(targetId.toString());

        http.get()
                .uri("/api/v1/admin/audit-logs?targetId={id}&action=user.suspend", targetId)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.totalItems")
                .isEqualTo(1)
                .jsonPath("$.items[0].action")
                .isEqualTo("user.suspend");

        http.get()
                .uri("/api/v1/admin/audit-logs?actorId={id}&from={from}", adminId, before)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.totalItems")
                .isEqualTo(2);

        http.get()
                .uri("/api/v1/admin/audit-logs?actorId={id}&to={to}", adminId, before)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.totalItems")
                .isEqualTo(0);

        http.get()
                .uri("/api/v1/admin/audit-logs?size=500")
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isBadRequest()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void adminCannotSuspendSelfOrAnotherAdmin() {
        String admin = uniqueUid("audit-self");
        UUID adminId = provisionWithRoles(admin, Role.ADMIN);
        String otherAdmin = uniqueUid("audit-other-admin");
        UUID otherAdminId = provisionWithRoles(otherAdmin, Role.ADMIN);

        http.post()
                .uri("/api/v1/admin/users/{id}/suspend", adminId)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("reason", "self"))
                .exchange()
                .expectStatus()
                .isEqualTo(409);

        http.post()
                .uri("/api/v1/admin/users/{id}/suspend", otherAdminId)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("reason", "peer"))
                .exchange()
                .expectStatus()
                .isForbidden();

        http.post()
                .uri("/api/v1/admin/users/{id}/suspend", otherAdminId)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("reason", ""))
                .exchange()
                .expectStatus()
                .isBadRequest()
                .expectBody()
                .jsonPath("$.errors[0].field")
                .isEqualTo("reason");
        assertThat(testUsers.auditRowsFor(otherAdminId)).isEmpty();
    }
}
