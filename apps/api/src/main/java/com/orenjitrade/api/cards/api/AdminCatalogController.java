package com.orenjitrade.api.cards.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.cards.domain.CardDetail;
import com.orenjitrade.api.cards.domain.CatalogAdminService;
import com.orenjitrade.api.cards.domain.PrintingDetail;
import com.orenjitrade.api.cards.domain.SetSummary;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/sets}, {@code /api/v1/admin/cards} and {@code /api/v1/admin/printings}:
 * catalog edits for the admin console "Cards" section (ADMIN, SUPER_ADMIN; every write audited).
 */
@RestController
@RequestMapping(
        path = "/api/v1/admin",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-catalog", description = "Catalog administration (admin console)")
public class AdminCatalogController {

    private final CatalogAdminService adminService;

    public AdminCatalogController(CatalogAdminService adminService) {
        this.adminService = adminService;
    }

    @PostMapping("/sets")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "createSet",
            summary = "Create a card set (ADMIN, SUPER_ADMIN)",
            description = "409 when the code exists for the game. Audited (`card_set.create`).")
    @ApiResponse(responseCode = "201", description = "Created")
    public SetSummary createSet(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @Valid @RequestBody AdminCatalogRequests.SetRequest body) {
        return adminService.createSet(actor, requireGame(body.gameSlug()), body.toValues());
    }

    @PutMapping("/sets/{id}")
    @Operation(
            operationId = "updateSet",
            summary = "Change a card set (ADMIN, SUPER_ADMIN)",
            description = "The code cannot change. Audited (`card_set.update`).")
    public SetSummary updateSet(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody AdminCatalogRequests.SetRequest body) {
        return adminService.updateSet(actor, id, body.toValues());
    }

    @PostMapping("/cards")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "createCard",
            summary = "Create a card (ADMIN, SUPER_ADMIN)",
            description =
                    "The slug is derived from the name (suffixed when taken) and never changes."
                            + " Metadata of declared GameSchema fields must have the declared"
                            + " type. Audited (`card.create`).")
    @ApiResponse(responseCode = "201", description = "Created")
    public CardDetail createCard(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @Valid @RequestBody AdminCatalogRequests.CardRequest body) {
        return adminService.createCard(actor, requireGame(body.gameSlug()), body.toValues());
    }

    @PutMapping("/cards/{id}")
    @Operation(
            operationId = "updateCard",
            summary = "Change a card (ADMIN, SUPER_ADMIN)",
            description =
                    "Name, types, text and metadata; the slug is kept. Audited (`card.update`).")
    public CardDetail updateCard(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody AdminCatalogRequests.CardRequest body) {
        return adminService.updateCard(actor, id, body.toValues());
    }

    @PostMapping("/cards/{id}/printings")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "createPrinting",
            summary = "Add a printing to a card (ADMIN, SUPER_ADMIN)",
            description =
                    "Set of the same game; edition, language, finish and rarity from the"
                            + " GameSchema; 409 for a duplicate (set, number, edition, language,"
                            + " finish). Audited (`card_printing.create`).")
    @ApiResponse(responseCode = "201", description = "Created")
    public PrintingDetail createPrinting(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody AdminCatalogRequests.PrintingRequest body) {
        return adminService.createPrinting(actor, id, body.toInput());
    }

    @PutMapping("/printings/{id}")
    @Operation(
            operationId = "updatePrinting",
            summary = "Change a printing (ADMIN, SUPER_ADMIN)",
            description = "Audited (`card_printing.update`).")
    public PrintingDetail updatePrinting(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody AdminCatalogRequests.PrintingRequest body) {
        return adminService.updatePrinting(actor, id, body.toInput());
    }

    private static String requireGame(@Nullable String gameSlug) {
        if (gameSlug == null || gameSlug.isBlank()) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("gameSlug", "must not be blank")));
        }
        return gameSlug.trim();
    }
}
