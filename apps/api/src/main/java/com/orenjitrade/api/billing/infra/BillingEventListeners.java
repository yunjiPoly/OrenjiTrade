package com.orenjitrade.api.billing.infra;

import com.orenjitrade.api.billing.domain.BillingWebhookService;
import com.orenjitrade.api.billing.events.BillingWebhookReceived;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Consumers of the billing module (Spring Modulith registry: after commit, own transaction, retried
 * after a crash): stored provider webhooks are applied by {@link BillingWebhookService#process}
 * (idempotent: only RECEIVED rows are applied).
 */
@Component
public class BillingEventListeners {

    private final BillingWebhookService webhooks;

    public BillingEventListeners(BillingWebhookService webhooks) {
        this.webhooks = webhooks;
    }

    @ApplicationModuleListener
    void on(BillingWebhookReceived event) {
        webhooks.process(event);
    }
}
