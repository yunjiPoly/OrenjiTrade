package com.orenjitrade.api.cards.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Map;

/**
 * A printing with its card, set and metadata.
 *
 * @param printing the printing
 * @param card its card (summary)
 * @param set its set
 * @param metadata printing-specific attributes
 */
@Schema(name = "PrintingDetail", description = "Printing with card, set and metadata")
public record PrintingDetail(
        PrintingSummary printing, CardSummary card, SetSummary set, Map<String, Object> metadata) {}
