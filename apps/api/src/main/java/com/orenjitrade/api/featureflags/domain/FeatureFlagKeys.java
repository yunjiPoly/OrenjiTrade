package com.orenjitrade.api.featureflags.domain;

/**
 * Keys of the flags created by the migrations ({@code V010__feature_flags.sql}). Values are data
 * (ADR 0014); only the names are code.
 */
public final class FeatureFlagKeys {

    /** Camera card scanning (Phase 11; kept off by owner decision). */
    public static final String ML_SCANNING = "mlScanning";

    /** Protected payments, shipping and disputes (Phase 9). */
    public static final String PROTECTED_PAYMENTS = "protectedPayments";

    /** Public community channels (Phase 5). */
    public static final String PUBLIC_CHAT = "publicChat";

    /**
     * Scan with camera: the phone reads a Yu-Gi-Oh! card's name and set code on the device, the API
     * matches them and adds the scanned cards (V129, on by default).
     */
    public static final String CARD_TEXT_SCAN = "cardTextScan";

    private FeatureFlagKeys() {}
}
