package com.orenjitrade.api.cards.api;

import com.orenjitrade.api.cards.domain.CardDetail;
import com.orenjitrade.api.cards.domain.CardSuggestion;
import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.cards.domain.PrintingDetail;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.common.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.util.MultiValueMap;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Public card catalog: search, autocomplete, card and printing details (no auth). */
@RestController
@Validated
@Tag(name = "catalog", description = "Games, sets, cards and printings (public catalog)")
public class CardController {

    private final CatalogService catalogService;

    public CardController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @GetMapping(path = "/api/v1/cards", produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "searchCards",
            summary = "Search cards (public)",
            description =
                    "Full-text search on name, type and text (accent-insensitive, `simple` config)"
                        + " ranked with ts_rank_cd, plus trigram typo tolerance when fewer than 5"
                        + " rows match. An exact printing code (`AZR-EN001`) returns that card"
                        + " only. Filters: `game`, `set` (id or code), printing `rarity`,"
                        + " `language`, `edition`, and `metadata.<key>=<value>` for the game's"
                        + " filterable GameSchema fields (requires `game`; number, string,"
                        + " string_list and boolean fields; repeat a string_list key to require"
                        + " several values). Without `query`: by name. `metadata` in the results"
                        + " holds the game's summary fields.")
    public PageResponse<CardSummary> search(
            @Parameter(description = "Game slug, e.g. yugioh")
                    @RequestParam(required = false)
                    @Size(max = 32)
                    @Nullable String game,
            @Parameter(description = "Free text or printing code")
                    @RequestParam(required = false)
                    @Size(max = 100)
                    @Nullable String query,
            @Parameter(description = "Set id or set code")
                    @RequestParam(required = false)
                    @Size(max = 40)
                    @Nullable String set,
            @RequestParam(required = false) @Size(max = 40) @Nullable String rarity,
            @Parameter(description = "ISO 639-1 code")
                    @RequestParam(required = false)
                    @Size(max = 2)
                    @Nullable String language,
            @Parameter(description = "Edition code, e.g. FIRST_EDITION")
                    @RequestParam(required = false)
                    @Size(max = 32)
                    @Nullable String edition,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @Parameter(hidden = true) @RequestParam MultiValueMap<String, String> parameters) {
        Map<String, List<String>> metadata = new LinkedHashMap<>();
        parameters.forEach(
                (key, values) -> {
                    if (key.startsWith(CatalogService.METADATA_PREFIX)
                            && key.length() > CatalogService.METADATA_PREFIX.length()) {
                        metadata.put(
                                key.substring(CatalogService.METADATA_PREFIX.length()), values);
                    }
                });
        return catalogService.searchCards(
                new CatalogService.CardQuery(
                        game, query, set, rarity, language, edition, metadata, page, size));
    }

    @GetMapping(path = "/api/v1/cards/suggest", produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "suggestCards",
            summary = "Autocomplete cards and printing codes (public)",
            description =
                    "Printing-code prefixes (`AZR-EN0`) first (kind PRINTING), then cards by name:"
                            + " prefix, substring, full text, trigram (kind CARD).")
    public List<CardSuggestion> suggest(
            @Parameter(description = "Game slug") @RequestParam(required = false) @Size(max = 32)
                    @Nullable String game,
            @Parameter(description = "Typed text") @RequestParam @NotBlank @Size(max = 100)
                    String q,
            @RequestParam(defaultValue = "8") @Min(1) @Max(20) int limit) {
        return catalogService.suggest(game, q, limit);
    }

    @GetMapping(path = "/api/v1/cards/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "getCard",
            summary = "Card with metadata and printings (public)",
            description = "404 for unknown cards and cards of hidden games.")
    public CardDetail card(@PathVariable UUID id) {
        return catalogService.card(id);
    }

    @GetMapping(path = "/api/v1/cards/{id}/printings", produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "listCardPrintings",
            summary = "Printings of a card (public)",
            description = "Earliest set first; images default to the placeholder SVG.")
    public List<PrintingSummary> printings(@PathVariable UUID id) {
        return catalogService.printingsOfCard(id);
    }

    @GetMapping(path = "/api/v1/printings/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "getPrinting",
            summary = "Printing with card, set, images and metadata (public)")
    public PrintingDetail printing(@PathVariable UUID id) {
        return catalogService.printing(id);
    }
}
