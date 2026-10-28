package com.orenjitrade.api.cards.infra.scryfall;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * JSON shapes of the Scryfall API (only the fields OrenjiTrade maps; everything else is ignored).
 * Reference: https://scryfall.com/docs/api/bulk-data and https://scryfall.com/docs/api/cards.
 */
final class ScryfallDtos {

    private ScryfallDtos() {}

    /** {@code GET /bulk-data}: {@code {"object": "list", "data": [...]}}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record BulkList(@Nullable List<BulkData> data) {}

    /**
     * One bulk file: its type, when it was generated and where it is downloaded. Since 2026-10-28
     * Scryfall lists {@code jsonl_download_uri} (a gzip-compressed JSON Lines file, one card object
     * per line) and {@code compressed_size}; the list before named {@code download_uri} (one JSON
     * array, served gzip-encoded), {@code size}, {@code content_type} and {@code content_encoding}.
     * Both shapes are read.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record BulkData(
            @Nullable String type,
            @JsonProperty("updated_at") @Nullable String updatedAt,
            @JsonProperty("jsonl_download_uri") @Nullable String jsonlDownloadUri,
            @JsonProperty("compressed_size") @Nullable Long compressedSize,
            @JsonProperty("download_uri") @Nullable String downloadUri,
            @Nullable Long size,
            @JsonProperty("content_type") @Nullable String contentType,
            @JsonProperty("content_encoding") @Nullable String contentEncoding) {

        /**
         * Where the file is downloaded: {@code jsonl_download_uri} when Scryfall gives one, else
         * the older {@code download_uri}; null when neither is given (a blank value counts as
         * none). The current field comes first: it is the one Scryfall documents now, so the import
         * never depends on a field being phased out, and its gzip file is the smaller download. The
         * parser reads either file.
         */
        @Nullable String downloadAddress() {
            if (jsonlDownloadUri != null && !jsonlDownloadUri.isBlank()) {
                return jsonlDownloadUri;
            }
            if (downloadUri != null && !downloadUri.isBlank()) {
                return downloadUri;
            }
            return null;
        }
    }

    /** A card object of a bulk file (one printing; the Unique Artwork file holds one per art). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Card(
            @Nullable String id,
            @JsonProperty("oracle_id") @Nullable String oracleId,
            @Nullable String name,
            @Nullable String lang,
            @Nullable String layout,
            @Nullable String set,
            @JsonProperty("set_name") @Nullable String setName,
            @JsonProperty("set_id") @Nullable String setId,
            @JsonProperty("set_type") @Nullable String setType,
            @JsonProperty("collector_number") @Nullable String collectorNumber,
            @JsonProperty("released_at") @Nullable String releasedAt,
            @Nullable String rarity,
            @Nullable Boolean digital,
            @Nullable List<String> games,
            @Nullable List<String> finishes,
            @Nullable Boolean oversized,
            @Nullable Boolean promo,
            @JsonProperty("illustration_id") @Nullable String illustrationId,
            @JsonProperty("image_status") @Nullable String imageStatus,
            @JsonProperty("image_uris") @Nullable Map<String, String> imageUris,
            @JsonProperty("card_faces") @Nullable List<Face> cardFaces,
            @JsonProperty("mana_cost") @Nullable String manaCost,
            @Nullable Double cmc,
            @JsonProperty("type_line") @Nullable String typeLine,
            @JsonProperty("oracle_text") @Nullable String oracleText,
            @Nullable String power,
            @Nullable String toughness,
            @JsonProperty("color_identity") @Nullable List<String> colorIdentity,
            @Nullable String artist) {}

    /** One face of a multi-faced card (transform, modal double-faced, split, flip, adventure). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Face(
            @Nullable String name,
            @JsonProperty("mana_cost") @Nullable String manaCost,
            @JsonProperty("type_line") @Nullable String typeLine,
            @JsonProperty("oracle_text") @Nullable String oracleText,
            @Nullable String power,
            @Nullable String toughness,
            @JsonProperty("oracle_id") @Nullable String oracleId,
            @JsonProperty("illustration_id") @Nullable String illustrationId,
            @JsonProperty("image_uris") @Nullable Map<String, String> imageUris,
            @Nullable String artist) {}
}
