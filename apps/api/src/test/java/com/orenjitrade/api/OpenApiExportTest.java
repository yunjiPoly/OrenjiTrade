package com.orenjitrade.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.core.util.DefaultIndenter;
import tools.jackson.core.util.DefaultPrettyPrinter;
import tools.jackson.core.util.Separators;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Exports the OpenAPI contract to {@code docs/api/openapi.json}. Runs only through {@code ./gradlew
 * exportOpenApi} (tag {@code openapi}, excluded from the regular test task) because it writes into
 * the repository.
 */
@Tag("openapi")
class OpenApiExportTest extends AbstractIntegrationTest {

    /** Set by the exportOpenApi Gradle task; falls back to the path relative to apps/api. */
    static final String EXPORT_FILE_PROPERTY = "orenji.openapi.export.file";

    static final Path DEFAULT_EXPORT_FILE = Paths.get("..", "..", "docs", "api", "openapi.json");

    @Autowired private JsonMapper jsonMapper;

    @Test
    void exportsOpenApiDocument() throws IOException {
        EntityExchangeResult<byte[]> result =
                http.get()
                        .uri("/v3/api-docs")
                        .exchange()
                        .expectStatus()
                        .isOk()
                        .expectHeader()
                        .contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
                        .expectBody()
                        .returnResult();

        byte[] body = result.getResponseBody();
        assertThat(body).isNotNull();
        JsonNode document = jsonMapper.readTree(body);

        assertThat(document.path("openapi").asString()).startsWith("3.1");
        assertThat(document.path("info").path("title").asString()).isEqualTo("OrenjiTrade API");
        assertThat(document.path("info").path("version").asString()).isEqualTo("0.1.0");
        assertThat(document.path("info").path("license").path("url").asString())
                .isEqualTo("https://www.orenjitrade.com/legal/terms");

        JsonNode paths = document.path("paths");
        assertThat(paths.has("/api/v1/meta")).isTrue();
        assertThat(paths.path("/api/v1/meta").path("get").path("operationId").asString())
                .isEqualTo("getMeta");
        assertThat(paths.has("/api/v1/me")).isTrue();
        assertThat(paths.has("/api/v1/me/ping")).isTrue();
        assertThat(paths.has("/api/v1/me/consents")).isTrue();
        assertThat(paths.has("/api/v1/public/legal/documents")).isTrue();
        assertThat(paths.has("/api/v1/admin/users")).isTrue();
        assertThat(paths.has("/api/v1/admin/users/{id}")).isTrue();
        assertThat(paths.has("/api/v1/admin/users/{id}/suspend")).isTrue();
        assertThat(paths.has("/api/v1/admin/users/{id}/unsuspend")).isTrue();
        assertThat(paths.has("/api/v1/admin/users/{id}/roles")).isTrue();
        assertThat(paths.has("/api/v1/admin/audit-logs")).isTrue();
        assertThat(paths.has("/internal/jobs/ping")).isTrue();
        assertThat(paths.has("/error")).as("/error must not be exported").isFalse();

        JsonNode getMe = paths.path("/api/v1/me").path("get");
        assertThat(getMe.path("summary").asString()).isNotEmpty();
        assertThat(getMe.path("responses").has("401")).isTrue();
        assertThat(getMe.path("responses").has("403")).isTrue();
        assertThat(getMe.path("responses").has("428")).isTrue();
        assertThat(getMe.path("responses").has("429")).isTrue();
        assertThat(
                        getMe.path("responses")
                                .path("401")
                                .path("content")
                                .path("application/problem+json")
                                .path("schema")
                                .path("$ref")
                                .asString())
                .isEqualTo("#/components/schemas/ProblemDetail");
        JsonNode publicDocuments = paths.path("/api/v1/public/legal/documents").path("get");
        assertThat(publicDocuments.path("security").isArray()).isTrue();
        assertThat(publicDocuments.path("security")).isEmpty();
        assertThat(publicDocuments.path("responses").has("401")).isFalse();

        JsonNode schemas = document.path("components").path("schemas");
        assertThat(schemas.has("MetaResponse")).isTrue();
        assertThat(schemas.has("MeResponse")).isTrue();
        assertThat(schemas.has("AdminUserSummary")).isTrue();
        assertThat(schemas.has("AdminUserDetail")).isTrue();
        assertThat(schemas.has("AuditLogEntry")).isTrue();
        assertThat(schemas.has("ProblemDetail")).isTrue();
        assertThat(schemas.path("ProblemDetail").path("properties").path("errorCode").path("enum"))
                .anySatisfy(code -> assertThat(code.asString()).isEqualTo("ACCOUNT_SUSPENDED"));
        assertThat(document.path("components").path("securitySchemes").has("bearerAuth")).isTrue();
        assertThat(document.path("components").path("securitySchemes").has("serviceToken"))
                .isTrue();

        Path target = resolveExportFile();
        Files.createDirectories(target.getParent());
        Files.writeString(target, prettyPrint(document), StandardCharsets.UTF_8);

        assertThat(target).exists();
        assertThat(Files.readString(target)).contains("\"/api/v1/me\"");
    }

    private String prettyPrint(JsonNode document) {
        DefaultIndenter indenter = new DefaultIndenter("  ", "\n");
        DefaultPrettyPrinter printer =
                new DefaultPrettyPrinter(
                                Separators.createDefaultInstance()
                                        .withObjectNameValueSpacing(Separators.Spacing.AFTER)
                                        .withObjectEmptySeparator("")
                                        .withArrayEmptySeparator(""))
                        .withObjectIndenter(indenter)
                        .withArrayIndenter(indenter);
        return jsonMapper.writer().with(printer).writeValueAsString(document) + "\n";
    }

    private static Path resolveExportFile() {
        String configured = System.getProperty(EXPORT_FILE_PROPERTY);
        Path path =
                configured != null && !configured.isBlank()
                        ? Paths.get(configured)
                        : Paths.get(System.getProperty("user.dir")).resolve(DEFAULT_EXPORT_FILE);
        return path.toAbsolutePath().normalize();
    }
}
