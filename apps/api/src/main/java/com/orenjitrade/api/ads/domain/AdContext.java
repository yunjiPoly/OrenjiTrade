package com.orenjitrade.api.ads.domain;

import com.orenjitrade.api.ads.domain.AdEnums.PlacementKey;
import java.time.Instant;
import java.util.Set;
import org.jspecify.annotations.Nullable;

/**
 * What targeting may look at when ads are selected. Built from public data only: the requested game
 * and platform region, the viewer's country and state/province (never a city, a coordinate or a
 * distance; ADR 0017), the viewer's interest games and tag slugs, and the plan.
 *
 * @param placement where the ads appear
 * @param game requested game slug (the page's game)
 * @param interestGames the viewer's interest games (used when no game is requested)
 * @param regionCode the page's platform region, else the viewer's home region
 * @param countryCode the viewer's country when it is in that region
 * @param subdivisionCode the viewer's state/province when it is in that region
 * @param tags the viewer's tag slugs
 * @param planCode FREE, PREMIUM, ... or {@code ANONYMOUS} for signed-out visitors
 * @param userHash pseudonymous viewer hash (frequency caps), {@code null} when signed out
 * @param now selection time
 */
public record AdContext(
        PlacementKey placement,
        @Nullable String game,
        Set<String> interestGames,
        @Nullable String regionCode,
        @Nullable String countryCode,
        @Nullable String subdivisionCode,
        Set<String> tags,
        String planCode,
        @Nullable String userHash,
        Instant now) {

    /** Plan code of signed-out visitors in PLAN targeting rules. */
    public static final String ANONYMOUS = "ANONYMOUS";

    public AdContext {
        interestGames = Set.copyOf(interestGames);
        tags = Set.copyOf(tags);
    }
}
