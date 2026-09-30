package com.orenjitrade.api.payments.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Status of a seller's payout account at the provider ({@code seller_account.status}). */
@Schema(name = "SellerAccountStatus")
public enum SellerAccountState {
    NOT_STARTED,
    PENDING,
    ACTIVE,
    RESTRICTED
}
