package com.orenjitrade.api.credits.domain;

/**
 * Type of a credit ledger entry ({@code credit_ledger_entry.type}): EARN and GRANT add, SPEND and
 * EXPIRE remove, ADJUST and REVERSAL correct in either direction (the ledger is never edited).
 */
public enum CreditEntryType {
    EARN,
    SPEND,
    GRANT,
    EXPIRE,
    ADJUST,
    REVERSAL
}
