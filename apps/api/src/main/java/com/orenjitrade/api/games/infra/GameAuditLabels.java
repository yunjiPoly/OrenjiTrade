package com.orenjitrade.api.games.infra;

import com.orenjitrade.api.audit.domain.AuditTargetLabels;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/**
 * Names games in the audit log (spec 15.8): a game by its name, a catalog sync by its game
 * ("Yu-Gi-Oh! catalog"), the card image cache cleared or checked for one game by that game's name,
 * for every game as "Every game".
 */
@Component
public class GameAuditLabels implements AuditTargetLabels {

    static final String TARGET_GAME = "GAME";
    static final String TARGET_CATALOG = "CATALOG";
    static final String TARGET_CACHE = "CARD_IMAGE_CACHE";

    private final GameService games;

    public GameAuditLabels(GameService games) {
        this.games = games;
    }

    @Override
    public Set<String> targetTypes() {
        return Set.of(TARGET_GAME, TARGET_CATALOG, TARGET_CACHE);
    }

    @Override
    public Map<String, String> labelsOf(String targetType, Collection<Target> targets) {
        Map<String, String> names =
                games.all().stream().collect(Collectors.toMap(GameView::slug, GameView::shortName));
        Map<String, String> labels = new LinkedHashMap<>();
        for (Target target : targets) {
            @Nullable String label =
                    switch (targetType) {
                        case TARGET_GAME -> names.get(target.id());
                        case TARGET_CATALOG -> {
                            @Nullable String game = slug(target.details().get("game"));
                            yield game == null || !names.containsKey(game)
                                    ? null
                                    : names.get(game) + " catalog";
                        }
                        default ->
                                "*".equals(target.id())
                                        ? "Every game"
                                        : names.getOrDefault(target.id(), null);
                    };
            if (label != null) {
                labels.put(target.id(), label);
            }
        }
        return labels;
    }

    private static @Nullable String slug(@Nullable Object value) {
        return value instanceof String s && !s.isBlank() ? s : null;
    }
}
