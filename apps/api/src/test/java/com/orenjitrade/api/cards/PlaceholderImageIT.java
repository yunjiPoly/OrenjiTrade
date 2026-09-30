package com.orenjitrade.api.cards;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;

/** Server-generated placeholder SVGs: public, cacheable, escaped, 404 for unknown cards. */
class PlaceholderImageIT extends AbstractIntegrationTest {

    static final String BASE = "/api/v1/public/placeholder-images/";

    @Autowired private CatalogImportService importService;

    @BeforeEach
    void catalog() {
        CatalogTestSupport.ensureImported(importService);
    }

    @Test
    void servesACacheableSvgWithTheCardName() {
        EntityExchangeResult<byte[]> result =
                call(HttpMethod.GET, BASE + "yugioh/azure-eyes-sky-dragon.svg", null, null);
        assertThat(result.getStatus().value()).isEqualTo(200);
        HttpHeaders headers = result.getResponseHeaders();
        assertThat(headers.getContentType()).isNotNull();
        assertThat(headers.getContentType().toString()).startsWith("image/svg+xml");
        assertThat(headers.getCacheControl()).contains("max-age=86400").contains("public");
        assertThat(headers.getETag()).isNotBlank();
        assertThat(headers.getFirst("Content-Security-Policy"))
                .isEqualTo("default-src 'none'; style-src 'unsafe-inline'");
        String svg = new String(result.getResponseBody(), StandardCharsets.UTF_8);
        assertThat(svg).startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\"");
        assertThat(svg)
                .contains("Azure-Eyes Sky", "Yu-Gi-Oh!", "aria-label=\"Azure-Eyes Sky Dragon\"");
        assertThat(svg).doesNotContain("<script", "href=", "http://example");

        // Conditional request.
        EntityExchangeResult<byte[]> notModified =
                http.get()
                        .uri(BASE + "yugioh/azure-eyes-sky-dragon.svg")
                        .header(HttpHeaders.IF_NONE_MATCH, headers.getETag())
                        .exchange()
                        .expectBody()
                        .returnResult();
        assertThat(notModified.getStatus().value()).isEqualTo(304);
    }

    @Test
    void escapesNamesAndHandlesAccents() {
        String apostrophe =
                new String(
                        call(
                                        HttpMethod.GET,
                                        BASE + "yugioh/monarch-s-tempest-decree.svg",
                                        null,
                                        null)
                                .getResponseBody(),
                        StandardCharsets.UTF_8);
        assertThat(apostrophe).contains("Monarch&apos;s").doesNotContain("Monarch's");
        String accent =
                new String(
                        call(HttpMethod.GET, BASE + "pokemon/petalune-ex.svg", null, null)
                                .getResponseBody(),
                        StandardCharsets.UTF_8);
        assertThat(accent).contains("Pétalune ex", "Pokémon");
    }

    @Test
    void unknownOrMalformedRequestsAreNotFound() {
        for (String path :
                new String[] {
                    "yugioh/no-such-card.svg",
                    "yugioh/azure-eyes-sky-dragon.png",
                    "yugioh/azure-eyes-sky-dragon",
                    "chess/azure-eyes-sky-dragon.svg",
                    "pokemon/azure-eyes-sky-dragon.svg",
                    "yugioh/Azure-Eyes.svg"
                }) {
            EntityExchangeResult<byte[]> result = call(HttpMethod.GET, BASE + path, null, null);
            assertThat(result.getStatus().value()).as(path).isEqualTo(404);
            assertThat(new String(result.getResponseBody(), StandardCharsets.UTF_8))
                    .contains("NOT_FOUND");
        }
    }
}
