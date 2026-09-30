package com.orenjitrade.api.donations.infra;

import com.orenjitrade.api.donations.domain.DonationWebhookService;
import com.orenjitrade.api.donations.events.DonationWebhookReceived;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Consumers of the donations module (Spring Modulith registry: after commit, own transaction,
 * retried after a crash): stored provider webhooks are applied by {@link
 * DonationWebhookService#process} (idempotent: only RECEIVED rows are applied).
 */
@Component
public class DonationEventListeners {

    private final DonationWebhookService webhooks;

    public DonationEventListeners(DonationWebhookService webhooks) {
        this.webhooks = webhooks;
    }

    @ApplicationModuleListener
    void on(DonationWebhookReceived event) {
        webhooks.process(event);
    }
}
