package com.orenjitrade.api.ads.domain;

import com.orenjitrade.api.ads.domain.AdEnums.PlacementKey;
import com.orenjitrade.api.ads.domain.AdProvider.Delivery;
import com.orenjitrade.api.ads.domain.AdProvider.ServedAd;
import com.orenjitrade.api.analytics.domain.ActorHasher;
import com.orenjitrade.api.billing.domain.Entitlements;
import com.orenjitrade.api.billing.domain.PlanCodes;
import com.orenjitrade.api.billing.domain.PlanFeatureRule;
import com.orenjitrade.api.billing.domain.PlanService;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.featureflags.domain.FeatureFlagKeys;
import com.orenjitrade.api.featureflags.domain.FeatureFlagView;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.location.domain.PublicLocation;
import com.orenjitrade.api.profiles.domain.ProfileService;
import com.orenjitrade.api.profiles.domain.TagView;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;

/**
 * Member-facing advertising (Phase 10 contract "Advertising framework"; feature flag {@code
 * advertising}). {@link #ads} answers an empty list while the flag is off for the caller or the
 * caller's effective {@code ads.enabled} feature is false (PREMIUM, or an entitlement); otherwise
 * it builds a public {@link AdContext} (requested game and grid cell, the viewer's public grid cell
 * and region label from {@link LocationService#publicLocationOf}, interest games and tags, plan)
 * and asks the {@link AdProvider}. Private locations are never read. Every served ad carries a
 * signed {@link AdToken}; impressions and clicks are recorded once per token.
 */
@Service
public class AdService {

    /** Plan feature switching ads on (FREE) or off (PREMIUM). */
    public static final String ADS_FEATURE = "ads.enabled";

    /** The label every ad carries. */
    public static final String SPONSORED = "Sponsored";

    private final AdProvider provider;
    private final AdToken tokens;
    private final FeatureFlags featureFlags;
    private final Entitlements entitlements;
    private final PlanService plans;
    private final LocationService locations;
    private final ProfileService profiles;
    private final ActorHasher actorHasher;
    private final TimeProvider timeProvider;

    public AdService(
            AdProvider provider,
            AdToken tokens,
            FeatureFlags featureFlags,
            Entitlements entitlements,
            PlanService plans,
            LocationService locations,
            ProfileService profiles,
            ActorHasher actorHasher,
            TimeProvider timeProvider) {
        this.provider = provider;
        this.tokens = tokens;
        this.featureFlags = featureFlags;
        this.entitlements = entitlements;
        this.plans = plans;
        this.locations = locations;
        this.profiles = profiles;
        this.actorHasher = actorHasher;
        this.timeProvider = timeProvider;
    }

    /**
     * A served ad with its serve token.
     *
     * @param ad the ad
     * @param token signed serve token (impression and click)
     */
    public record ServedAdWithToken(ServedAd ad, String token) {}

    /** Ads for a placement (empty when ads are off for the caller). */
    public List<ServedAdWithToken> ads(
            @Nullable UUID viewerId,
            PlacementKey placement,
            @Nullable String game,
            @Nullable String geoCell) {
        @Nullable String cleanGame = normaliseGame(game);
        @Nullable String cleanCell = normaliseCell(geoCell);
        if (!featureFlags.isEnabled(FeatureFlagKeys.ADVERTISING, viewerId)) {
            return List.of();
        }
        AdContext context;
        Instant now = timeProvider.now();
        if (viewerId == null) {
            if (!freePlanShowsAds()) {
                return List.of();
            }
            context =
                    new AdContext(
                            placement,
                            cleanGame,
                            Set.of(),
                            cleanCell,
                            null,
                            Set.of(),
                            AdContext.ANONYMOUS,
                            null,
                            now);
        } else {
            if (!entitlements.has(viewerId, ADS_FEATURE)) {
                return List.of();
            }
            Optional<PublicLocation> location = locations.publicLocationOf(viewerId);
            Optional<ProfileService.PublicProfileParts> parts = profiles.publicPartsOf(viewerId);
            context =
                    new AdContext(
                            placement,
                            cleanGame,
                            parts.map(p -> Set.copyOf(p.games())).orElse(Set.of()),
                            cleanCell != null
                                    ? cleanCell
                                    : location.map(PublicLocation::gridCell).orElse(null),
                            location.map(PublicLocation::label)
                                    .filter(label -> !label.isBlank())
                                    .orElse(null),
                            parts.map(
                                            p ->
                                                    p.tags().stream()
                                                            .map(TagView::slug)
                                                            .collect(Collectors.toSet()))
                                    .orElse(Set.of()),
                            plans.planOf(viewerId).code(),
                            actorHasher.hash(viewerId),
                            now);
        }
        return provider.selectAds(placement, context).stream()
                .map(
                        ad ->
                                new ServedAdWithToken(
                                        ad,
                                        tokens.issue(
                                                ad.creativeId(),
                                                placement,
                                                context.geoCell(),
                                                context.userHash(),
                                                now)))
                .toList();
    }

    /**
     * Records an impression of a served ad: 400 for a token not issued for this creative (or
     * expired); a repeated token is accepted without a second impression. Nothing is recorded while
     * the flag is off for everybody.
     */
    public boolean recordImpression(UUID creativeId, @Nullable String token) {
        Instant now = timeProvider.now();
        AdToken.Serve serve =
                tokens.verify(token, creativeId, now)
                        .orElseThrow(
                                () ->
                                        ApiException.validation(
                                                "Validation failed",
                                                List.of(
                                                        new ProblemFieldError(
                                                                "token",
                                                                "is not a valid serve token for"
                                                                        + " this ad"))));
        if (!activeForAnyone()) {
            return false;
        }
        return provider.recordImpression(delivery(serve, now));
    }

    /**
     * Where a click leads (404 for unknown creatives); a valid serve token records the click once.
     */
    public String click(UUID creativeId, @Nullable String token) {
        String landing =
                provider.landingUrl(creativeId)
                        .orElseThrow(() -> ApiException.notFound("Ad not found"));
        Instant now = timeProvider.now();
        if (activeForAnyone()) {
            tokens.verify(token, creativeId, now)
                    .ifPresent(serve -> provider.recordClick(delivery(serve, now)));
        }
        return landing;
    }

    private static Delivery delivery(AdToken.Serve serve, Instant now) {
        return new Delivery(
                serve.serveId(),
                serve.creativeId(),
                serve.placement(),
                serve.userHash(),
                serve.geoCell(),
                now);
    }

    private boolean freePlanShowsAds() {
        return plans.find(PlanCodes.FREE)
                .flatMap(plan -> plan.feature(ADS_FEATURE))
                .map(PlanFeatureRule::enabled)
                .orElse(true);
    }

    private boolean activeForAnyone() {
        return featureFlags.all().stream()
                .filter(flag -> flag.key().equals(FeatureFlagKeys.ADVERTISING))
                .findFirst()
                .map(AdService::active)
                .orElse(false);
    }

    private static boolean active(FeatureFlagView flag) {
        return flag.enabled() && flag.rolloutPercent() > 0;
    }

    private static @Nullable String normaliseGame(@Nullable String game) {
        if (game == null || game.isBlank()) {
            return null;
        }
        String slug = game.trim().toLowerCase(Locale.ROOT);
        if (!Targeting.SLUG.matcher(slug).matches()) {
            throw ApiException.validation(
                    "Validation failed", List.of(new ProblemFieldError("game", "unknown game")));
        }
        return slug;
    }

    private static @Nullable String normaliseCell(@Nullable String geoCell) {
        if (geoCell == null || geoCell.isBlank()) {
            return null;
        }
        String cell = geoCell.trim().toLowerCase(Locale.ROOT);
        if (!Targeting.GEO_CELL.matcher(cell).matches()) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    "geoCell", "must be a public grid cell id (r<row>c<col>)")));
        }
        return cell;
    }
}
