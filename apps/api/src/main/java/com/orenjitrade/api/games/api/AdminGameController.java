package com.orenjitrade.api.games.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/v1/admin/games}: list, create and edit games (ADMIN, SUPER_ADMIN; audited). */
@RestController
@RequestMapping(path = "/api/v1/admin/games", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-catalog", description = "Catalog administration (admin console)")
public class AdminGameController {

    private final GameService gameService;

    public AdminGameController(GameService gameService) {
        this.gameService = gameService;
    }

    @GetMapping
    @Operation(
            operationId = "listAdminGames",
            summary = "List games including hidden ones (ADMIN, SUPER_ADMIN)")
    public List<GameView> list() {
        return gameService.all();
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "createGame",
            summary = "Create a game (ADMIN, SUPER_ADMIN)",
            description = "409 when the slug exists. Audited (`game.create`).")
    @ApiResponse(responseCode = "201", description = "Created")
    public GameView create(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @Valid @RequestBody GameRequest body) {
        if (body.slug() == null) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("slug", "must not be null")));
        }
        return gameService.create(actor, body.toDraft(), body.slug());
    }

    @PutMapping(path = "/{slug}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateGame",
            summary = "Change a game and its schema (ADMIN, SUPER_ADMIN)",
            description =
                    "Name, publisher, status (HIDDEN removes it from public endpoints and profile"
                            + " choices), order and GameSchema. The slug is immutable. Audited"
                            + " (`game.update`).")
    public GameView update(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable String slug,
            @Valid @RequestBody GameRequest body) {
        return gameService.update(actor, slug, body.toDraft());
    }
}
