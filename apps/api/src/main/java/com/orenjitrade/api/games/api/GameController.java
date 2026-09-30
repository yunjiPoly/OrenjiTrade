package com.orenjitrade.api.games.api;

import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/games} and {@code GET /api/v1/games/{slug}} (public). */
@RestController
@RequestMapping(path = "/api/v1/games", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "catalog", description = "Games, sets, cards and printings (public catalog)")
public class GameController {

    private final GameService gameService;

    public GameController(GameService gameService) {
        this.gameService = gameService;
    }

    @GetMapping
    @SecurityRequirements
    @Operation(
            operationId = "listGames",
            summary = "Supported games with their schema (public)",
            description = "ACTIVE games in display order, each with its GameSchema.")
    public List<GameView> list() {
        return gameService.active();
    }

    @GetMapping("/{slug}")
    @SecurityRequirements
    @Operation(
            operationId = "getGame",
            summary = "One game with its schema (public)",
            description = "404 for unknown or hidden games.")
    public GameView get(@PathVariable String slug) {
        return gameService.requireActive(slug);
    }
}
