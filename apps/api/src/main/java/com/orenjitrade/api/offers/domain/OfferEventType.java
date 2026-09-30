package com.orenjitrade.api.offers.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Entry of an offer's history ({@code offer_event.event}). */
@Schema(name = "OfferEventType")
public enum OfferEventType {
    CREATED,
    COUNTERED,
    ACCEPTED,
    DECLINED,
    CANCELLED,
    EXPIRED,
    /** The party who has to answer opened the proposal for the first time. */
    VIEWED
}
