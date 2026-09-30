package com.orenjitrade.api.users;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

/** 428 TERMS_ACCEPTANCE_REQUIRED until every required document is accepted. */
class TermsIT extends AbstractIntegrationTest {

    @Test
    void newUserIsBlockedUntilConsentsAreGiven() {
        String uid = uniqueUid("terms");
        JsonNode me = me(uid);
        JsonNode required = me.path("requiredConsents");
        assertThat(required).hasSize(4);
        List<String> documentTypes = new ArrayList<>();
        required.forEach(consent -> documentTypes.add(consent.path("documentType").asString()));
        assertThat(documentTypes)
                .containsExactlyInAnyOrder(
                        "TERMS", "PRIVACY", "COMMUNITY_GUIDELINES", "ACCEPTABLE_USE");

        http.get()
                .uri("/api/v1/me/ping")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isEqualTo(428)
                .expectHeader()
                .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("TERMS_ACCEPTANCE_REQUIRED")
                .jsonPath("$.status")
                .isEqualTo(428)
                .jsonPath("$.requiredConsents.length()")
                .isEqualTo(4)
                .jsonPath("$.requiredConsents[0].documentType")
                .isEqualTo("ACCEPTABLE_USE")
                .jsonPath("$.requiredConsents[0].version")
                .isEqualTo("2026-09-01");

        // Exempt routes keep working.
        http.get()
                .uri("/api/v1/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isOk();

        for (JsonNode consent : required) {
            http.post()
                    .uri("/api/v1/me/consents")
                    .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(
                            Map.of(
                                    "documentType",
                                    consent.path("documentType").asString(),
                                    "version",
                                    consent.path("version").asString()))
                    .exchange()
                    .expectStatus()
                    .isNoContent();
        }

        http.get()
                .uri("/api/v1/me/ping")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isOk();

        assertThat(me(uid).path("requiredConsents")).isEmpty();
    }

    @Test
    void wrongVersionIsConflict() {
        String uid = uniqueUid("terms-version");
        provision(uid);

        http.post()
                .uri("/api/v1/me/consents")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("documentType", "TERMS", "version", "2020-01-01"))
                .exchange()
                .expectStatus()
                .isEqualTo(409)
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("CONFLICT")
                .jsonPath("$.message")
                .value(String.class, message -> assertThat(message).contains("2026-09-01"));
    }

    @Test
    void partialConsentsStillBlock() {
        String uid = uniqueUid("terms-partial");
        provision(uid);

        http.post()
                .uri("/api/v1/me/consents")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("documentType", "TERMS", "version", "2026-09-01"))
                .exchange()
                .expectStatus()
                .isNoContent();

        http.get()
                .uri("/api/v1/me/ping")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isEqualTo(428)
                .expectBody()
                .jsonPath("$.requiredConsents.length()")
                .isEqualTo(3);
    }
}
