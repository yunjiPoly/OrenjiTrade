package com.orenjitrade.api.games.infra;

import com.orenjitrade.api.games.domain.GameCatalog;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;

/** {@link GameCatalog} backed by {@code orenji.games.slugs} until the games tables exist. */
@Component
public class ConfiguredGameCatalog implements GameCatalog {

    private final List<String> slugs;

    public ConfiguredGameCatalog(GamesProperties properties) {
        this.slugs =
                properties.slugs().stream()
                        .map(slug -> slug.trim().toLowerCase(Locale.ROOT))
                        .filter(slug -> !slug.isEmpty())
                        .distinct()
                        .toList();
    }

    @Override
    public List<String> slugs() {
        return slugs;
    }
}
