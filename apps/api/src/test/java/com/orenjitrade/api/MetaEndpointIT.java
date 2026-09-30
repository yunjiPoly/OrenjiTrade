package com.orenjitrade.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.common.RequestIdFilter;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.client.EntityExchangeResult;

/** {@code GET /api/v1/meta}, request-id propagation and CORS. */
class MetaEndpointIT extends AbstractIntegrationTest {

    private static final String ALLOWED_ORIGIN = "http://localhost:4200";
    private static final String DISALLOWED_ORIGIN = "https://evil.example";

    @Test
    void returnsBuildAndEnvironmentMetadata() {
        EntityExchangeResult<byte[]> result =
                http.get()
                        .uri("/api/v1/meta")
                        .exchange()
                        .expectStatus()
                        .isOk()
                        .expectHeader()
                        .contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
                        .expectBody()
                        .jsonPath("$.name")
                        .isEqualTo("OrenjiTrade API")
                        .jsonPath("$.version")
                        .isEqualTo("0.1.0")
                        .jsonPath("$.environment")
                        .isEqualTo("test")
                        .jsonPath("$.serverTime")
                        .value(String.class, value -> assertThat(Instant.parse(value)).isNotNull())
                        .returnResult();

        assertThat(result.getResponseBody()).isNotNull();
    }

    @Test
    void echoesValidRequestId() {
        http.get()
                .uri("/api/v1/meta")
                .header(RequestIdFilter.HEADER, "client-trace-001")
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .valueEquals(RequestIdFilter.HEADER, "client-trace-001");
    }

    @Test
    void generatesRequestIdWhenAbsent() {
        EntityExchangeResult<byte[]> result =
                http.get()
                        .uri("/api/v1/meta")
                        .exchange()
                        .expectStatus()
                        .isOk()
                        .expectBody()
                        .returnResult();

        String requestId = result.getResponseHeaders().getFirst(RequestIdFilter.HEADER);
        assertThat(requestId).isNotNull();
        assertThat(UUID.fromString(requestId)).isNotNull();
    }

    @Test
    void replacesUnsafeRequestId() {
        String unsafe = "bad id <script>" + "x".repeat(80);
        EntityExchangeResult<byte[]> result =
                http.get()
                        .uri("/api/v1/meta")
                        .header(RequestIdFilter.HEADER, unsafe)
                        .exchange()
                        .expectStatus()
                        .isOk()
                        .expectBody()
                        .returnResult();

        String requestId = result.getResponseHeaders().getFirst(RequestIdFilter.HEADER);
        assertThat(requestId).isNotNull().isNotEqualTo(unsafe);
        assertThat(UUID.fromString(requestId)).isNotNull();
    }

    @Test
    void corsPreflightFromAllowedOriginSucceeds() {
        http.options()
                .uri("/api/v1/meta")
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization,x-request-id")
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .valueEquals(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ALLOWED_ORIGIN)
                .expectHeader()
                .valueEquals(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true")
                .expectHeader()
                .value(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS,
                        methods -> assertThat(methods).contains("GET", "POST", "PATCH", "DELETE"));
    }

    @Test
    void corsActualRequestExposesRequestIdHeader() {
        http.get()
                .uri("/api/v1/meta")
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .valueEquals(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ALLOWED_ORIGIN)
                .expectHeader()
                .value(
                        HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS,
                        exposed -> assertThat(exposed).contains(RequestIdFilter.HEADER));
    }

    @Test
    void corsPreflightFromDisallowedOriginIsRejected() {
        http.options()
                .uri("/api/v1/meta")
                .header(HttpHeaders.ORIGIN, DISALLOWED_ORIGIN)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                .exchange()
                .expectStatus()
                .isForbidden()
                .expectHeader()
                .doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN);
    }
}
