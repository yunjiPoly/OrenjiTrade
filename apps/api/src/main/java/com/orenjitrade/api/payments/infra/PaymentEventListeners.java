package com.orenjitrade.api.payments.infra;

import com.orenjitrade.api.payments.domain.PaymentActivity;
import com.orenjitrade.api.payments.domain.WebhookService;
import com.orenjitrade.api.payments.events.DisputeUpdated;
import com.orenjitrade.api.payments.events.PaymentUpdated;
import com.orenjitrade.api.payments.events.PaymentWebhookReceived;
import com.orenjitrade.api.trades.events.TradeUpdated;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Consumers of the payments module (Spring Modulith registry: after commit, own transaction,
 * retried after a crash): stored webhooks are applied by {@link WebhookService#process}; payment,
 * dispute and trade changes go to {@link PaymentActivity}. Every consumer is idempotent (webhook
 * rows are applied once, notifications carry de-duplication keys).
 */
@Component
public class PaymentEventListeners {

    private final WebhookService webhooks;
    private final PaymentActivity activity;

    public PaymentEventListeners(WebhookService webhooks, PaymentActivity activity) {
        this.webhooks = webhooks;
        this.activity = activity;
    }

    @ApplicationModuleListener
    void on(PaymentWebhookReceived event) {
        webhooks.process(event);
    }

    @ApplicationModuleListener
    void on(PaymentUpdated event) {
        activity.paymentUpdated(event);
    }

    @ApplicationModuleListener
    void on(DisputeUpdated event) {
        activity.disputeUpdated(event);
    }

    @ApplicationModuleListener
    void on(TradeUpdated event) {
        activity.tradeUpdated(event);
    }
}
