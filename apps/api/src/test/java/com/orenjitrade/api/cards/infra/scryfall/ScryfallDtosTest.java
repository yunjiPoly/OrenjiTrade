package com.orenjitrade.api.cards.infra.scryfall;

import static org.assertj.core.api.Assertions.assertThat;

import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code GET /bulk-data} as Scryfall lists it since 2026-10-28 ({@code jsonl_download_uri}, {@code
 * compressed_size}; no {@code download_uri}) and as it did before, and the one download address the
 * adapter takes from either (hand-written entries of the same shape; no call to Scryfall).
 */
class ScryfallDtosTest {

    private final JsonMapper mapper = JsonMapper.builder().build();

    private static ScryfallDtos.BulkData bulk(
            @Nullable String jsonlDownloadUri, @Nullable String downloadUri) {
        return new ScryfallDtos.BulkData(
                "unique_artwork",
                "2026-10-28T09:02:31.861+00:00",
                jsonlDownloadUri,
                null,
                downloadUri,
                null,
                null,
                null);
    }

    @Test
    void readsTheBulkListOf20261028() {
        String json =
                """
                {"object": "list", "has_more": false, "data": [
                  {"object": "bulk_data", "id": "0b000000-0000-4000-8000-000000000002",
                   "type": "unique_artwork", "updated_at": "2026-10-28T09:02:31.861+00:00",
                   "uri": "https://api.scryfall.com/bulk-data/0b000000-0000-4000-8000-000000000002",
                   "name": "Unique Artwork", "description": "Fixture.",
                   "jsonl_download_uri":
                     "https://data.scryfall.io/unique-artwork/unique-artwork-20261028090231.jsonl.gz",
                   "compressed_size": 38686452}
                ]}
                """;
        ScryfallDtos.BulkData bulk =
                mapper.readValue(json, ScryfallDtos.BulkList.class).data().get(0);
        assertThat(bulk.type()).isEqualTo("unique_artwork");
        assertThat(ScryfallCardProvider.version(bulk.updatedAt())).isEqualTo("20261028090231");
        assertThat(bulk.downloadUri()).isNull();
        assertThat(bulk.compressedSize()).isEqualTo(38_686_452L);
        assertThat(bulk.downloadAddress())
                .isEqualTo(
                        "https://data.scryfall.io/unique-artwork/"
                                + "unique-artwork-20261028090231.jsonl.gz");
    }

    @Test
    void readsTheBulkListBefore20261028() {
        String json =
                """
                {"object": "list", "data": [
                  {"object": "bulk_data", "type": "unique_artwork",
                   "updated_at": "2026-10-20T09:03:12.345+00:00",
                   "download_uri": "https://data.scryfall.io/unique-artwork/unique-artwork-1.json",
                   "size": 123456, "content_type": "application/json",
                   "content_encoding": "gzip"}
                ]}
                """;
        ScryfallDtos.BulkData bulk =
                mapper.readValue(json, ScryfallDtos.BulkList.class).data().get(0);
        assertThat(bulk.jsonlDownloadUri()).isNull();
        assertThat(bulk.size()).isEqualTo(123_456L);
        assertThat(bulk.downloadAddress())
                .isEqualTo("https://data.scryfall.io/unique-artwork/unique-artwork-1.json");
    }

    @Test
    void theJsonLinesAddressComesFirstAndABlankAddressIsNone() {
        String jsonl = "https://data.scryfall.io/unique-artwork/a.jsonl.gz";
        String legacy = "https://data.scryfall.io/unique-artwork/a.json";
        assertThat(bulk(jsonl, legacy).downloadAddress()).isEqualTo(jsonl);
        assertThat(bulk(jsonl, null).downloadAddress()).isEqualTo(jsonl);
        assertThat(bulk(null, legacy).downloadAddress()).isEqualTo(legacy);
        assertThat(bulk("", legacy).downloadAddress()).isEqualTo(legacy);
        assertThat(bulk("  ", legacy).downloadAddress()).isEqualTo(legacy);
        assertThat(bulk(null, null).downloadAddress()).isNull();
        assertThat(bulk("", " ").downloadAddress()).isNull();
    }
}
