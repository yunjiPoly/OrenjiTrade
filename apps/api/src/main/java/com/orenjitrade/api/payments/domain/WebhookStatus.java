package com.orenjitrade.api.payments.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Processing state of a stored provider webhook ({@code payment_webhook_event.status}). */
@Schema(name = "PaymentWebhookStatus")
public enum WebhookStatus {
    RECEIVED,
    PROCESSED,
    IGNORED,
    FAILED
}
