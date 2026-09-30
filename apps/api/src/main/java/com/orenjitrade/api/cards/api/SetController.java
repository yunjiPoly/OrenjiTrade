package com.orenjitrade.api.cards.api;

import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.cards.domain.SetDetail;
import com.orenjitrade.api.cards.domain.SetSummary;
import com.orenjitrade.api.common.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/sets} and {@code GET /api/v1/sets/{id}} (public). */
@RestController
@RequestMapping(path = "/api/v1/sets", produces = MediaType.APPLICATION_JSON_VALUE)
@Validated
@Tag(name = "catalog", description = "Games, sets, cards and printings (public catalog)")
public class SetController {

    private final CatalogService catalogService;

    public SetController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @GetMapping
    @SecurityRequirements
    @Operation(
            operationId = "listSets",
            summary = "Search card sets (public)",
            description =
                    "Newest first. `query` matches the exact code first, then the name (full text,"
                            + " substring, trigram).")
    public PageResponse<SetSummary> list(
            @Parameter(description = "Game slug") @RequestParam(required = false) @Size(max = 32)
                    @Nullable String game,
            @RequestParam(required = false) @Size(max = 100) @Nullable String query,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return catalogService.sets(game, query, page, size);
    }

    @GetMapping("/{id}")
    @SecurityRequirements
    @Operation(
            operationId = "getSet",
            summary = "Set with a page of its printings (public)",
            description = "Printings by collector number; `page`/`size` page them.")
    public SetDetail get(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "50") @Min(1) @Max(200) int size) {
        return catalogService.set(id, page, size);
    }
}
