package com.orenjitrade.api.ads.domain;

/** Vocabularies of the advertising framework (V092 CHECK constraints). */
public final class AdEnums {

    private AdEnums() {}

    /** Where ads may appear ({@code ad_placement.key}). */
    public enum PlacementKey {
        SEARCH_SPONSORED,
        MAP_PANEL,
        INVENTORY_SIDEBAR,
        COLLECTOR_PROFILE,
        MOBILE_FEED
    }

    /** {@code ad_campaign.status}. */
    public enum CampaignStatus {
        DRAFT,
        ACTIVE,
        PAUSED,
        ENDED
    }

    /** {@code ad_creative.status}. */
    public enum CreativeStatus {
        DRAFT,
        ACTIVE,
        PAUSED,
        ARCHIVED
    }

    /** {@code advertiser.status}. */
    public enum AdvertiserStatus {
        ACTIVE,
        PAUSED,
        ARCHIVED
    }

    /**
     * {@code ad_campaign.pricing}: CPM (bid per 1000 impressions), CPC (bid per click), FLAT (the
     * total budget is a flat fee; no spend pacing).
     */
    public enum PricingModel {
        CPM,
        CPC,
        FLAT
    }

    /**
     * {@code ad_targeting_rule.kind}: never a point. GAME slug, REGION_LABEL (a public region label
     * or one of its comma-separated parts), GEO_CELL (public ~1 km grid cell id), TAG slug, PLAN
     * code (FREE, PREMIUM, ANONYMOUS).
     */
    public enum TargetingKind {
        GAME,
        REGION_LABEL,
        GEO_CELL,
        TAG,
        PLAN
    }

    /** Conversion kinds ({@code ad_conversion.kind}). */
    public enum ConversionKind {
        SIGNUP,
        PURCHASE,
        OTHER
    }
}
