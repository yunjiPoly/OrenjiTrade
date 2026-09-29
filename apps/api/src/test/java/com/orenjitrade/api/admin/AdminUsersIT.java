package com.orenjitrade.api.admin;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.Role;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

/** {@code GET /api/v1/admin/users} filters and the detail view. */
class AdminUsersIT extends AbstractIntegrationTest {

    @Test
    void listFiltersByQueryStatusAndRole() {
        String admin = uniqueUid("list-admin");
        provisionWithRoles(admin, Role.ADMIN);
        String marker = uniqueUid("zz");
        String a = marker + "-alpha";
        String b = marker + "-beta";
        UUID aId = provisionCompliant(a);
        UUID bId = provisionWithRoles(b, Role.MODERATOR);
        testUsers.setStatus(bId, AccountStatus.SUSPENDED, null);

        http.get()
                .uri("/api/v1/admin/users?query={q}&size=50", marker)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.totalItems")
                .isEqualTo(2)
                .jsonPath("$.size")
                .isEqualTo(50)
                .jsonPath("$.items[*].id")
                .value(
                        List.class,
                        ids ->
                                assertThat(ids)
                                        .containsExactlyInAnyOrder(aId.toString(), bId.toString()))
                .jsonPath("$.items[0].email")
                .isNotEmpty()
                .jsonPath("$.items[0].avatarUrl")
                .value(url -> assertThat(url).isNull());

        http.get()
                .uri("/api/v1/admin/users?query={q}&status=SUSPENDED", marker)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.totalItems")
                .isEqualTo(1)
                .jsonPath("$.items[0].id")
                .isEqualTo(bId.toString());

        http.get()
                .uri("/api/v1/admin/users?query={q}&role=MODERATOR", marker)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.totalItems")
                .isEqualTo(1)
                .jsonPath("$.items[0].id")
                .isEqualTo(bId.toString())
                .jsonPath("$.items[0].roles")
                .value(List.class, roles -> assertThat(roles).contains("MODERATOR", "USER"));

        // Email search (case-insensitive) and the LIKE wildcard escaping.
        http.get()
                .uri("/api/v1/admin/users?query={q}", (a + "@ORENJITRADE.TEST").toUpperCase())
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.totalItems")
                .isEqualTo(1);
        http.get()
                .uri("/api/v1/admin/users?query={q}", "%")
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.totalItems")
                .isEqualTo(0);

        http.get()
                .uri("/api/v1/admin/users?status=NOPE")
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isBadRequest();
    }

    @Test
    void detailContainsConsentsAndNoCoordinates() {
        String admin = uniqueUid("detail-admin");
        provisionWithRoles(admin, Role.ADMIN);
        String target = uniqueUid("detail-target");
        UUID targetId = provisionCompliant(target);

        String body =
                new String(
                        http.get()
                                .uri("/api/v1/admin/users/{id}", targetId)
                                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                                .exchange()
                                .expectStatus()
                                .isOk()
                                .expectBody()
                                .jsonPath("$.account.id")
                                .isEqualTo(targetId.toString())
                                .jsonPath("$.account.status")
                                .isEqualTo("ACTIVE")
                                .jsonPath("$.consents.length()")
                                .isEqualTo(4)
                                .jsonPath("$.consents[0].acceptedAt")
                                .isNotEmpty()
                                .jsonPath("$.recentAuditEntries")
                                .isArray()
                                .jsonPath("$.suspensionReason")
                                .value(reason -> assertThat(reason).isNull())
                                .returnResult()
                                .getResponseBodyContent());

        assertThat(body).doesNotContain("lat").doesNotContain("lng").doesNotContain("ip_hash");
        assertThat(body).doesNotContain("ipHash");
    }
}
