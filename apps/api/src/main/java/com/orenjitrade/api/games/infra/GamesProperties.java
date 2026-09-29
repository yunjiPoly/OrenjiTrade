package com.orenjitrade.api.games.infra;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.games.*}.
 *
 * @param slugs supported game slugs (until the Phase 2 catalogue tables exist)
 */
@ConfigurationProperties(prefix = "orenji.games")
public record GamesProperties(
        @DefaultValue({"yugioh", "pokemon", "mtg", "riftbound"}) List<String> slugs) {}
