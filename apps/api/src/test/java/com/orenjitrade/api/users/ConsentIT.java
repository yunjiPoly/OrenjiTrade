package com.orenjitrade.api.users;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/** Public legal documents and consent recording. */
class ConsentIT extends AbstractIntegrationTest {

    @Test
    void legalDocumentsArePublic() {
        http.get()
                .uri("/api/v1/public/legal/documents")
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
                .expectBody()
                .jsonPath("$.length()")
                .isEqualTo(9)
                .jsonPath("$[?(@.documentType == 'TERMS')].url")
                .isEqualTo("/legal/terms")
                .jsonPath("$[?(@.documentType == 'TERMS')].requiredAtRegistration")
                .isEqualTo(true)
                .jsonPath("$[?(@.documentType == 'COOKIES')].requiredAtRegistration")
                .isEqualTo(false)
                .jsonPath("$[?(@.documentType == 'COOKIES')].url")
                .isEqualTo("/legal/cookies")
                .jsonPath("$[?(@.documentType == 'AGE_CONFIRMATION')].requiredAtRegistration")
                .isEqualTo(false)
                .jsonPath("$[?(@.documentType == 'AGE_CONFIRMATION')].version")
                .isEqualTo("2026-10-05")
                .jsonPath("$[*].version")
                .value(
                        List.class,
                        versions ->
                                assertThat(versions)
                                        .hasSize(9)
                                        .containsOnly("2026-09-01", "2026-10-05"))
                .jsonPath("$[*].title")
                .value(
                        List.class,
                        titles ->
                                assertThat(titles)
                                        .contains("Terms of Service", "Acceptable Use Policy"));
    }

    @Test
    void consentStoresHashedIpAndUserAgentAndIsIdempotent() {
        String uid = uniqueUid("consent");
        UUID id = provision(uid);

        for (int i = 0; i < 2; i++) {
            http.post()
                    .uri("/api/v1/me/consents")
                    .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                    .header(HttpHeaders.USER_AGENT, "ConsentIT/1.0")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("documentType", "PRIVACY", "version", "2026-09-01"))
                    .exchange()
                    .expectStatus()
                    .isNoContent();
        }

        List<Map<String, Object>> consents = testUsers.consentsOf(id);
        assertThat(consents).hasSize(1);
        Map<String, Object> consent = consents.get(0);
        assertThat(consent.get("document_type")).isEqualTo("PRIVACY");
        assertThat(consent.get("version")).isEqualTo("2026-09-01");
        assertThat(String.valueOf(consent.get("ip_hash"))).matches("^[0-9a-f]{64}$");
        assertThat(String.valueOf(consent.get("ip_hash"))).doesNotContain("127.0.0.1");
        assertThat(consent.get("user_agent")).isEqualTo("ConsentIT/1.0");
        // No language in the body (older clients): the English text is the one that was shown.
        assertThat(consent.get("language")).isEqualTo("en");
        assertThat(testUsers.auditRowsFor(id))
                .extracting(row -> row.get("action"))
                .containsExactly("consent.accept");
    }

    @Test
    void consentRecordsTheLanguageOfTheTextShown() {
        String uid = uniqueUid("consent-fr");
        UUID id = provision(uid);

        http.post()
                .uri("/api/v1/me/consents")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("documentType", "TERMS", "version", "2026-09-01", "language", "fr"))
                .exchange()
                .expectStatus()
                .isNoContent();
        // Same version, other language: the consent is already recorded (idempotent), the
        // first language stays (one legal_document version covers both translations).
        http.post()
                .uri("/api/v1/me/consents")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("documentType", "TERMS", "version", "2026-09-01", "language", "en"))
                .exchange()
                .expectStatus()
                .isNoContent();

        List<Map<String, Object>> consents = testUsers.consentsOf(id);
        assertThat(consents).hasSize(1);
        assertThat(consents.get(0).get("language")).isEqualTo("fr");
        assertThat(testUsers.auditRowsFor(id))
                .extracting(row -> String.valueOf(row.get("details")))
                .singleElement()
                .asString()
                .contains("\"language\"")
                .contains("\"fr\"");

        // The admin detail and the export expose the language with the version.
        String admin = uniqueUid("consent-fr-admin");
        provisionWithRoles(admin, Role.ADMIN);
        http.get()
                .uri("/api/v1/admin/users/{id}", id)
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.consents[?(@.documentType == 'TERMS')].language")
                .isEqualTo("fr");
    }

    @Test
    void unsupportedLanguageIsValidationFailure() {
        String uid = uniqueUid("consent-lang");
        provision(uid);

        http.post()
                .uri("/api/v1/me/consents")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("documentType", "TERMS", "version", "2026-09-01", "language", "de"))
                .exchange()
                .expectStatus()
                .isBadRequest()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("VALIDATION_FAILED")
                .jsonPath("$.errors[0].field")
                .isEqualTo("language");
    }

    @Test
    void unknownDocumentTypeIsValidationFailure() {
        String uid = uniqueUid("consent-bad");
        provision(uid);

        http.post()
                .uri("/api/v1/me/consents")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("documentType", "NOT_A_DOCUMENT", "version", "2026-09-01"))
                .exchange()
                .expectStatus()
                .isBadRequest()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("VALIDATION_FAILED");

        http.post()
                .uri("/api/v1/me/consents")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("documentType", "TERMS", "version", ""))
                .exchange()
                .expectStatus()
                .isBadRequest()
                .expectBody()
                .jsonPath("$.errorCode")
                .isEqualTo("VALIDATION_FAILED")
                .jsonPath("$.errors[0].field")
                .isEqualTo("version");
    }

    @Test
    void consentRequiresAuthentication() {
        http.post()
                .uri("/api/v1/me/consents")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("documentType", "TERMS", "version", "2026-09-01"))
                .exchange()
                .expectStatus()
                .isUnauthorized();
    }
}
