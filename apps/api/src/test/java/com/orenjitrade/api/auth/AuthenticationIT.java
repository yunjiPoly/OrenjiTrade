package com.orenjitrade.api.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.common.RequestIdFilter;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

/** Bearer token verification, first-login provisioning and account-state enforcement. */
class AuthenticationIT extends AbstractIntegrationTest {

    @Test
    void protectedRouteWithoutTokenIsUnauthenticatedProblem() {
        http.get()
                .uri("/api/v1/me")
                .header(RequestIdFilter.HEADER, "auth-it-no-token")
                .exchange()
                .expectStatus()
                .isUnauthorized()
                .expectHeader()
                .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectHeader()
                .value(
                        HttpHeaders.WWW_AUTHENTICATE,
                        value -> assertThat(value).startsWith("Bearer"))
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("UNAUTHENTICATED")
                .jsonPath("$.requestId")
                .isEqualTo("auth-it-no-token")
                .jsonPath("$.instance")
                .isEqualTo("/api/v1/me");
    }

    @Test
    void malformedTokenIsUnauthenticatedProblem() {
        http.get()
                .uri("/api/v1/me")
                .header(HttpHeaders.AUTHORIZATION, "Bearer not-a-valid-token")
                .exchange()
                .expectStatus()
                .isUnauthorized()
                .expectHeader()
                .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectHeader()
                .value(
                        HttpHeaders.WWW_AUTHENTICATE,
                        value -> assertThat(value).contains("invalid_token"))
                .expectBody()
                .jsonPath("$.status")
                .isEqualTo(401)
                .jsonPath("$.errorCode")
                .isEqualTo("UNAUTHENTICATED")
                .jsonPath("$.message")
                .isEqualTo("The access token is invalid");
    }

    @Test
    void emptyBearerTokenIsUnauthenticated() {
        http.get()
                .uri("/api/v1/me")
                .header(HttpHeaders.AUTHORIZATION, "Bearer ")
                .exchange()
                .expectStatus()
                .isUnauthorized()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("UNAUTHENTICATED");
    }

    @Test
    void malformedTokenOnPublicRouteIsRejectedToo() {
        http.get()
                .uri("/api/v1/public/legal/documents")
                .header(HttpHeaders.AUTHORIZATION, "Bearer garbage")
                .exchange()
                .expectStatus()
                .isUnauthorized();
    }

    @Test
    void firstCallProvisionsAccountWithUserRoleAndDerivedHandle() {
        String uid = uniqueUid("Alice.Wonder");
        Instant before = Instant.now().minusSeconds(5);

        JsonNode body = me(uid);

        UUID id = UUID.fromString(body.path("id").asString());
        assertThat(body.path("handle").asString()).startsWith("alice_wonder_");
        assertThat(body.path("handle").asString()).matches("^[a-z0-9_]{3,24}$");
        assertThat(body.path("email").asString())
                .isEqualTo(uid.toLowerCase() + "@orenjitrade.test");
        assertThat(body.path("emailVerified").asBoolean()).isTrue();
        assertThat(body.path("status").asString()).isEqualTo(AccountStatus.ACTIVE.name());
        assertThat(body.path("roles")).hasSize(1);
        assertThat(body.path("roles").get(0).asString()).isEqualTo(Role.USER.name());
        assertThat(body.path("plan").asString()).isEqualTo("FREE");
        assertThat(body.path("displayName").asString()).isEqualTo(body.path("handle").asString());
        assertThat(body.has("avatarUrl")).as("avatarUrl is present even when null").isTrue();
        assertThat(body.path("avatarUrl").isNull()).isTrue();
        assertThat(Instant.parse(body.path("createdAt").asString())).isAfter(before);
        assertThat(body.path("lastActiveAt").isNull()).isFalse();
        assertThat(body.path("onboarding").path("profileComplete").asBoolean()).isFalse();
        assertThat(body.path("onboarding").path("tradingAreaSet").asBoolean()).isFalse();
        assertThat(body.path("onboarding").path("interestsSet").asBoolean()).isFalse();
        assertThat(body.path("requiredConsents")).hasSize(4);
        assertThat(body.path("requiredConsents").get(0).path("version").asString())
                .isEqualTo("2026-09-01");

        Map<String, Object> row = testUsers.row(id);
        assertThat(row.get("provider_uid")).isEqualTo(uid);
        assertThat(row.get("status")).isEqualTo("ACTIVE");
        assertThat(row.get("plan_code")).isEqualTo("FREE");
        assertThat(testUsers.rolesOf(id)).containsExactly("USER");
    }

    @Test
    void secondCallReturnsTheSameAccount() {
        String uid = uniqueUid("repeat");

        JsonNode first = me(uid);
        JsonNode second = me(uid);

        assertThat(second.path("id").asString()).isEqualTo(first.path("id").asString());
        assertThat(second.path("handle").asString()).isEqualTo(first.path("handle").asString());
        assertThat(testUsers.findIdOf(uid)).isNotNull();
    }

    @Test
    void handleCollisionsGetNumericSuffix() {
        String first = uniqueUid("dup");
        JsonNode a = me(first + ":shared.handle." + first + "@example.test");
        JsonNode b = me(uniqueUid("dup") + ":shared.handle." + first + "@example.test");

        String handleA = a.path("handle").asString();
        String handleB = b.path("handle").asString();
        assertThat(handleA).isNotEqualTo(handleB);
        assertThat(handleB).matches("^[a-z0-9_]{3,24}$");
        assertThat(handleB).endsWith("_2");
    }

    @Test
    void unverifiedFlagIsReflected() {
        String uid = uniqueUid("unverified");

        JsonNode body = me(uid, "unverified");

        assertThat(body.path("emailVerified").asBoolean()).isFalse();
    }

    @Test
    void suspendedUserGetsAccountSuspendedProblemOnEveryProtectedRoute() {
        String uid = uniqueUid("suspended");
        UUID id = provisionCompliant(uid);
        Instant until = Instant.now().plusSeconds(3600).truncatedTo(ChronoUnit.MICROS);
        testUsers.setStatus(id, AccountStatus.SUSPENDED, until);

        http.get()
                .uri("/api/v1/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isForbidden()
                .expectHeader()
                .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("ACCOUNT_SUSPENDED")
                .jsonPath("$.suspendedUntil")
                .isEqualTo(until.toString());

        http.get()
                .uri("/api/v1/me/ping")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isForbidden()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("ACCOUNT_SUSPENDED");

        // Public routes never need an identity, so they keep working with the token attached.
        http.get()
                .uri("/api/v1/public/legal/documents")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isOk();
    }

    @Test
    void expiredTemporarySuspensionIsLiftedOnNextRequest() {
        String uid = uniqueUid("expired-suspension");
        UUID id = provisionCompliant(uid);
        testUsers.setStatus(id, AccountStatus.SUSPENDED, Instant.now().minusSeconds(60));

        JsonNode body = me(uid);

        assertThat(body.path("status").asString()).isEqualTo("ACTIVE");
        assertThat(testUsers.row(id).get("status")).isEqualTo("ACTIVE");
        assertThat(testUsers.auditRowsFor(id))
                .extracting(row -> row.get("action"))
                .contains("user.suspension.expired");
    }

    @Test
    void deletionRequestedUserMayOnlyReadMe() {
        String uid = uniqueUid("deleting");
        UUID id = provisionWithRoles(uid, Role.ADMIN);
        testUsers.setStatus(id, AccountStatus.DELETION_REQUESTED, null);

        http.get()
                .uri("/api/v1/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.status")
                .isEqualTo("DELETION_REQUESTED");

        http.get()
                .uri("/api/v1/admin/users")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isForbidden()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("ACCOUNT_SUSPENDED")
                .jsonPath("$.message")
                .isEqualTo("deletion pending");

        http.get()
                .uri("/api/v1/me/ping")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isForbidden()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("ACCOUNT_SUSPENDED");
    }

    @Test
    void deletedAccountIsRefused() {
        String uid = uniqueUid("deleted");
        UUID id = provisionCompliant(uid);
        testUsers.setStatus(id, AccountStatus.DELETED, null);

        http.get()
                .uri("/api/v1/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isForbidden()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("ACCOUNT_SUSPENDED");
    }

    @Test
    void pingTouchesLastActiveForCompliantUser() {
        String uid = uniqueUid("ping");
        provisionCompliant(uid);

        http.get()
                .uri("/api/v1/me/ping")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.ok")
                .isEqualTo(true)
                .jsonPath("$.serverTime")
                .isNotEmpty();
    }
}
