package com.orenjitrade.api.cards.images;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.cards.domain.ImageMode;
import com.orenjitrade.api.cards.domain.images.CardImageCache;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.client.EntityExchangeResult;

/**
 * {@code GET /api/v1/public/card-images/{id}} (ADR 0015): cached renditions with long immutable
 * caching and an ETag, on-demand fills for re-host-only artworks, the placeholder (short caching)
 * otherwise, never a provider URL.
 */
class CardImageServingIT extends AbstractCardImageIT {

    @BeforeEach
    void catalog() {
        importCatalog(ImageMode.NONE, null);
    }

    private EntityExchangeResult<byte[]> get(String id, String ifNoneMatch) {
        return http.get()
                .uri("/api/v1/public/card-images/" + id)
                .headers(
                        headers -> {
                            if (ifNoneMatch != null) {
                                headers.set(HttpHeaders.IF_NONE_MATCH, ifNoneMatch);
                            }
                        })
                .exchange()
                .expectBody()
                .returnResult();
    }

    @Test
    void aCachedRenditionIsServedWithImmutableCachingAndAnEtag() throws Exception {
        UUID id = imageId("900000002");
        assertThat(cache.ensureCached(id).cached()).isTrue();
        Map<String, Object> row = imageRow("900000002");
        EntityExchangeResult<byte[]> result = get(id.toString(), null);
        assertThat(result.getStatus().value()).isEqualTo(200);
        assertThat(result.getResponseHeaders().getContentType().toString()).isEqualTo("image/jpeg");
        assertThat(result.getResponseHeaders().getCacheControl())
                .contains("max-age=31536000", "public", "immutable");
        String etag = result.getResponseHeaders().getETag();
        assertThat(etag).isEqualTo("\"" + row.get("checksum_sha256") + "\"");
        assertThat(result.getResponseBody())
                .isEqualTo(
                        Files.readAllBytes(
                                cache.directory().resolve((String) row.get("storage_key"))));
        assertThat(result.getResponseHeaders().getFirst(HttpHeaders.LOCATION)).isNull();
        assertThat(imageRow("900000002").get("last_accessed_at")).isNotNull();

        EntityExchangeResult<byte[]> notModified = get(id.toString(), etag);
        assertThat(notModified.getStatus().value()).isEqualTo(304);
    }

    @Test
    void aNotCachedArtworkIsFilledOnDemandOnce() {
        UUID id = imageId("900000003");
        int hits = STUB.hits("/images/cards/900000003.jpg");
        EntityExchangeResult<byte[]> result = get(id.toString(), null);
        assertThat(result.getStatus().value()).isEqualTo(200);
        assertThat(result.getResponseHeaders().getContentType().toString()).isEqualTo("image/jpeg");
        assertThat(imageRow("900000003").get("cache_status")).isEqualTo("CACHED");
        get(id.toString(), null);
        assertThat(STUB.hits("/images/cards/900000003.jpg") - hits)
                .as("served from the cache afterwards")
                .isEqualTo(1);
    }

    @Test
    void missingArtworksAndUnknownIdsNeverRevealTheProvider() {
        STUB.behave("900000004", YgoProDeckStub.Behaviour.NOT_FOUND);
        UUID missing = imageId("900000004");
        EntityExchangeResult<byte[]> result = get(missing.toString(), null);
        assertThat(result.getStatus().value()).isEqualTo(200);
        assertThat(result.getResponseHeaders().getContentType().toString())
                .startsWith("image/svg+xml");
        assertThat(result.getResponseHeaders().getCacheControl()).contains("max-age=300");
        assertThat(result.getResponseHeaders().getFirst(HttpHeaders.LOCATION)).isNull();
        String svg = new String(result.getResponseBody(), StandardCharsets.UTF_8);
        assertThat(svg).contains("Mirage Xyz Test");
        assertNoProviderUrl(svg);
        cache.awaitIdle(Duration.ofSeconds(10));
        assertThat(imageRow("900000004").get("cache_status")).isEqualTo("MISSING_AT_SOURCE");

        assertThat(get(UUID.randomUUID().toString(), null).getStatus().value()).isEqualTo(404);
        assertThat(get("not-a-uuid", null).getStatus().value()).isEqualTo(404);
    }

    @Test
    void aRecentlyFailedArtworkIsNotRetriedOnDemand() {
        // A FAILED artwork is not retried on demand within the retry window: placeholder at once.
        STUB.behave("900000005", YgoProDeckStub.Behaviour.HTML);
        assertThat(cache.ensureCached(imageId("900000005")).outcome())
                .isEqualTo(CardImageCache.Outcome.FAILED);
        int hits = STUB.hits("/images/cards/900000005.jpg");
        EntityExchangeResult<byte[]> result = get(imageId("900000005").toString(), null);
        assertThat(result.getResponseHeaders().getContentType().toString())
                .startsWith("image/svg+xml");
        assertThat(STUB.hits("/images/cards/900000005.jpg")).isEqualTo(hits);
    }

    @Test
    void placeholderRowsOfTheMockCatalogAreServedAsPlaceholders() {
        com.orenjitrade.api.inventory.InventoryTestSupport.ensureCatalog(importService);
        UUID mockImage =
                (UUID)
                        testUsers
                                .query(
                                        "SELECT i.id FROM card_image i JOIN card_printing p ON"
                                                + " p.id = i.printing_id WHERE p.external_ref ->>"
                                                + " 'id' = 'ygo-p001a'")
                                .get(0)
                                .get("id");
        EntityExchangeResult<byte[]> result = get(mockImage.toString(), null);
        assertThat(result.getStatus().value()).isEqualTo(200);
        assertThat(result.getResponseHeaders().getContentType().toString())
                .startsWith("image/svg+xml");
    }
}
