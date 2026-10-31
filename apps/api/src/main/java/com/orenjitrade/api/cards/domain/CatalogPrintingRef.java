package com.orenjitrade.api.cards.domain;

import java.time.LocalDate;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A printing of an ACTIVE game without its images, with the release date of its set (grouped
 * catalog lookups of the inventory import: candidates of a file row, "the most recent printing").
 *
 * @param id printing id
 * @param cardId its card
 * @param game game slug
 * @param setCode set code
 * @param setName set name
 * @param setReleaseDate release date of the set, {@code null} when unknown
 * @param collectorNumber collector number within the set
 * @param printingCode code printed on the card
 * @param rarity rarity label
 * @param edition edition code
 * @param language ISO 639-1 code
 * @param finish finish code
 */
public record CatalogPrintingRef(
        UUID id,
        UUID cardId,
        String game,
        String setCode,
        String setName,
        @Nullable LocalDate setReleaseDate,
        String collectorNumber,
        @Nullable String printingCode,
        @Nullable String rarity,
        String edition,
        String language,
        String finish) {}
