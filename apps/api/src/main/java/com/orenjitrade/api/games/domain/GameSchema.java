package com.orenjitrade.api.games.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Optional;
import org.jspecify.annotations.Nullable;

/**
 * Per-game presentation and filtering rules stored in {@code game.schema} (ADR 0005): the
 * vocabularies of conditions, editions, languages, finishes and rarities, the game-specific
 * metadata fields and which of them a {@code CardSummary} carries.
 *
 * @param conditions inventory conditions, best first
 * @param editions printing editions (e.g. FIRST_EDITION, UNLIMITED)
 * @param languages ISO 639-1 codes
 * @param finishes printing finishes (NORMAL, FOIL, HOLO, ...)
 * @param rarities rarity labels
 * @param metadataFields game-specific attributes of {@code card.metadata}
 * @param summaryFields metadata keys included in card summaries
 */
@Schema(name = "GameSchema", description = "Vocabularies and metadata fields of a game")
public record GameSchema(
        @NotNull @Size(max = 20) List<@NotBlank @Pattern(regexp = CODE) String> conditions,
        @NotNull @Size(min = 1, max = 20) List<@NotBlank @Pattern(regexp = CODE) String> editions,
        @NotNull @Size(min = 1, max = 30)
                List<@NotBlank @Pattern(regexp = "^[a-z]{2}$") String> languages,
        @NotNull @Size(min = 1, max = 20) List<@NotBlank @Pattern(regexp = CODE) String> finishes,
        @NotNull @Size(max = 40) List<@NotBlank @Size(max = 40) String> rarities,
        @NotNull @Size(max = 40) List<@Valid @NotNull MetadataField> metadataFields,
        @NotNull @Size(max = 10) List<@NotBlank String> summaryFields) {

    /** Upper-case vocabulary codes such as {@code NEAR_MINT}. */
    public static final String CODE = "^[A-Z][A-Z0-9_]{1,31}$";

    public GameSchema {
        conditions = conditions == null ? List.of() : List.copyOf(conditions);
        editions = editions == null ? List.of() : List.copyOf(editions);
        languages = languages == null ? List.of() : List.copyOf(languages);
        finishes = finishes == null ? List.of() : List.copyOf(finishes);
        rarities = rarities == null ? List.of() : List.copyOf(rarities);
        metadataFields = metadataFields == null ? List.of() : List.copyOf(metadataFields);
        summaryFields = summaryFields == null ? List.of() : List.copyOf(summaryFields);
    }

    /** The metadata field named {@code key}. */
    public Optional<MetadataField> field(String key) {
        return metadataFields.stream().filter(field -> field.key().equals(key)).findFirst();
    }

    /**
     * A game-specific metadata attribute.
     *
     * @param key JSON key inside {@code card.metadata}
     * @param label display label
     * @param type {@code string}, {@code number}, {@code string_list} or {@code boolean}
     * @param filterable whether {@code GET /cards?metadata.<key>=} accepts it
     * @param options allowed values (strings), when the vocabulary is closed
     */
    @Schema(name = "GameMetadataField", description = "Game-specific card attribute")
    public record MetadataField(
            @NotBlank @Pattern(regexp = "^[a-z][A-Za-z0-9]{0,39}$") String key,
            @NotBlank @Size(max = 40) String label,
            @NotBlank
                    @Pattern(regexp = "^(string|number|string_list|boolean)$")
                    @Schema(allowableValues = {"string", "number", "string_list", "boolean"})
                    String type,
            boolean filterable,
            @Size(max = 60) @Nullable List<@NotBlank @Size(max = 40) String> options) {

        public static final String STRING = "string";
        public static final String NUMBER = "number";
        public static final String STRING_LIST = "string_list";
        public static final String BOOLEAN = "boolean";
    }
}
