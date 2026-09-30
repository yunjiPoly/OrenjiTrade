package com.orenjitrade.api.payments.domain;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * How a stored webhook was applied.
 *
 * @param status PROCESSED or IGNORED
 * @param paymentId the payment it concerned, if known
 * @param error why it was ignored (a code such as {@code UNKNOWN_PAYMENT}), if it was
 */
public record WebhookOutcome(
        WebhookStatus status, @Nullable UUID paymentId, @Nullable String error) {

    public static WebhookOutcome processed(@Nullable UUID paymentId) {
        return new WebhookOutcome(WebhookStatus.PROCESSED, paymentId, null);
    }

    public static WebhookOutcome ignored(@Nullable UUID paymentId, String code) {
        return new WebhookOutcome(WebhookStatus.IGNORED, paymentId, code);
    }
}
