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
        assertThat(document.path("paths").has("/api/v1/meta")).isTrue();
        assertThat(
                        document.path("paths")
                                .path("/api/v1/meta")
                                .path("get")
                                .path("operationId")
                                .asString())
                .isEqualTo("getMeta");
        assertThat(document.path("components").path("schemas").has("MetaResponse")).isTrue();
        assertThat(document.path("components").path("schemas").has("ProblemDetail")).isTrue();
        assertThat(document.path("components").path("securitySchemes").has("bearerAuth")).isTrue();

        Path target = resolveExportFile();
        Files.createDirectories(target.getParent());
        Files.writeString(target, prettyPrint(document), StandardCharsets.UTF_8);

        assertThat(target).exists();
        assertThat(Files.readString(target)).contains("\"/api/v1/meta\"");
    }

    private String prettyPrint(JsonNode document) {
        DefaultIndenter indenter = new DefaultIndenter("  ", "\n");
        DefaultPrettyPrinter printer =
                new DefaultPrettyPrinter(
                                Separators.createDefaultInstance()
                                        .withObjectNameValueSpacing(Separators.Spacing.AFTER))
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
