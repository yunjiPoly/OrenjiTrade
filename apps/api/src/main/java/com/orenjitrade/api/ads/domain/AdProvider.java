package com.orenjitrade.api.ads.domain;

import com.orenjitrade.api.ads.domain.AdEnums.PlacementKey;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Source of ads (Phase 10 contract "Advertising framework"): {@code InternalCampaignAdProvider}
 * serves the admin-managed campaigns with targeting and budget pacing; an {@code
 * ExternalNetworkAdProvider} adapter may be added behind the same interface later. Providers only
 * ever see an {@link AdContext} (public values) and pseudonymous viewer hashes.
 */
public interface AdProvider {

    /** Short provider id ({@code internal}). */
    String providerId();

    /** Ads for a placement, best first (at most the placement's {@code max_ads}). */
    List<ServedAd> selectAds(PlacementKey placement, AdContext context);

    /** Records an impression; false when the serve was already recorded or is unknown. */
    boolean recordImpression(Delivery delivery);

    /** Records a click; false when the serve already clicked or is unknown. */
    boolean recordClick(Delivery delivery);

    /** Where a creative's click leads, empty for unknown creatives. */
    Optional<String> landingUrl(UUID creativeId);

    /**
     * An ad chosen for a placement.
     *
     * @param creativeId creative
     * @param campaignId campaign
     * @param placement placement
     * @param advertiserName shown next to the "Sponsored" label
     * @param headline headline
     * @param body text
     * @param imageUrl optional image
     * @param ctaLabel call to action
     */
    record ServedAd(
            UUID creativeId,
            UUID campaignId,
            PlacementKey placement,
            String advertiserName,
            String headline,
            String body,
            @Nullable String imageUrl,
            String ctaLabel) {}

    /**
     * An impression or click of a served ad.
     *
     * @param serveId nonce of the serve token
     * @param creativeId creative
     * @param placement placement
     * @param userHash pseudonymous viewer hash
     * @param regionCode platform region of the context
     * @param subdivisionCode the viewer's subdivision code of the context
     * @param at when
     */
    record Delivery(
            UUID serveId,
            UUID creativeId,
            PlacementKey placement,
            @Nullable String userHash,
            @Nullable String regionCode,
            @Nullable String subdivisionCode,
            Instant at) {}
}
