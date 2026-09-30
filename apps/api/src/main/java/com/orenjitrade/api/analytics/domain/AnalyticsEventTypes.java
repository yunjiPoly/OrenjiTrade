package com.orenjitrade.api.analytics.domain;

/** Names of the analytics events (the {@code event_type} column). */
public final class AnalyticsEventTypes {

    /** A unified search, card-holder search or map search with a query or card filter. */
    public static final String SEARCH_PERFORMED = "search_performed";

    /** Same attributes as {@link #SEARCH_PERFORMED}, emitted when nothing was found. */
    public static final String SEARCH_NO_RESULTS = "search_no_results";

    /** A collector's profile or map preview was opened by someone else. */
    public static final String COLLECTOR_VIEWED = "collector_viewed";

    /** A public binder was opened by someone other than its owner. */
    public static final String BINDER_VIEWED = "binder_viewed";

    /** A card or printing detail page was served. */
    public static final String CARD_VIEWED = "card_viewed";

    /** A private message was sent (kind only; never the text or the participants' ids). */
    public static final String MESSAGE_SENT = "message_sent";

    /** A community post was published (channel slug and link flags only; never the text). */
    public static final String COMMUNITY_POST_CREATED = "community_post_created";

    /** A card was added to a wishlist (game, target kind, radius, filters; never notes). */
    public static final String WISHLIST_ITEM_CREATED = "wishlist_item_created";

    /** A public item matched a wishlist item (game, distance bucket, whether notified). */
    public static final String WISHLIST_MATCHED = "wishlist_matched";

    /** A rating was written or edited (interaction kind, score; never the comment or ids). */
    public static final String RATING_SUBMITTED = "rating_submitted";

    /** A collector was reported (reason and context source only; never details or ids). */
    public static final String COLLECTOR_REPORTED = "collector_reported";

    /** An offer was made (kind, game, message and protection flags; never amounts or text). */
    public static final String OFFER_CREATED = "offer_created";

    /** An offer was countered, accepted, declined, cancelled or expired (event, status, round). */
    public static final String OFFER_STATUS_CHANGED = "offer_status_changed";

    /** A trade was opened or changed (event, status, kind, protection and meetup flags). */
    public static final String TRADE_STATUS_CHANGED = "trade_status_changed";

    private AnalyticsEventTypes() {}
}
