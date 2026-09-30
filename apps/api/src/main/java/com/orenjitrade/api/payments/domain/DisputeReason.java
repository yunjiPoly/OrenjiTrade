package com.orenjitrade.api.payments.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Why the buyer opened a dispute ({@code dispute.reason}). */
@Schema(name = "DisputeReason")
public enum DisputeReason {
    NOT_RECEIVED,
    NOT_AS_DESCRIBED,
    COUNTERFEIT,
    DAMAGED,
    OTHER
}
