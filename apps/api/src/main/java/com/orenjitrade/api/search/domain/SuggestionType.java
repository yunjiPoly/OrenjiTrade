package com.orenjitrade.api.search.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Kind of a mixed autocomplete entry ({@code GET /search/suggest}). */
@Schema(name = "SuggestionType")
public enum SuggestionType {
    CARD,
    PRINTING,
    SET,
    COLLECTOR,
    BINDER,
    TAG
}
