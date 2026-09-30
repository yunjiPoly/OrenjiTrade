package com.orenjitrade.api.offers.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** What a party may do with a proposal ({@code allowedActions} of an offer). */
@Schema(name = "OfferAction")
public enum OfferAction {
    /** Propose other terms (the party whose turn it is). */
    COUNTER,
    /** Accept the terms: creates the trade (the party whose turn it is). */
    ACCEPT,
    /** Refuse the terms (the party whose turn it is). */
    DECLINE,
    /** Withdraw the first proposal while it is OPEN (the buyer). */
    CANCEL
}
