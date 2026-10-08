package com.orenjitrade.api.users.domain;

/** The legal documents the platform publishes ({@code legal_document.document_type}). */
public enum LegalDocumentType {
    TERMS,
    PRIVACY,
    COMMUNITY_GUIDELINES,
    MARKETPLACE_POLICY,
    PAYMENT_PROTECTION,
    REFUND_DISPUTE,
    COOKIES,
    ACCEPTABLE_USE,
    /**
     * The 18+ attestation ("I confirm I am 18 years of age or older"), recorded like any other
     * consent but never {@code required_at_registration}: the service layer gates discoverability,
     * messaging, community posts and offers on it instead of the terms filter (V103).
     */
    AGE_CONFIRMATION
}
