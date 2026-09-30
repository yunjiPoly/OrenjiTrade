package com.orenjitrade.api.reports.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Why a collector is reported ({@code collector_report.reason}), in the order the report dialog
 * lists them ({@code GET /public/report-reasons}).
 */
@Schema(name = "ReportReason")
public enum ReportReason {
    SCAM(
            "Scam or fraud",
            "Took payment or cards without delivering, fake payment proof, or other deception."),
    COUNTERFEIT("Counterfeit cards", "Offers or sent fake, proxy or altered cards as genuine."),
    HARASSMENT("Harassment", "Insults, threats, hateful or unwanted repeated contact."),
    SPAM("Spam", "Unsolicited promotion, repeated messages or advertising."),
    INAPPROPRIATE_BEHAVIOR(
            "Inappropriate behaviour",
            "Behaviour that breaks the Community Guidelines, including at meetups."),
    MISLEADING_LISTINGS(
            "Misleading listings",
            "Cards that are not available, wrong condition or prices that are not honoured."),
    OTHER("Something else", "Anything else the moderation team should look at.");

    private final String label;
    private final String description;

    ReportReason(String label, String description) {
        this.label = label;
        this.description = description;
    }

    public String label() {
        return label;
    }

    public String description() {
        return description;
    }
}
