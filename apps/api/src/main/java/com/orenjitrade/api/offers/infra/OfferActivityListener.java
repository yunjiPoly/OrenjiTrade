package com.orenjitrade.api.offers.infra;

import com.orenjitrade.api.offers.domain.OfferActivity;
import com.orenjitrade.api.offers.events.OfferCreated;
import com.orenjitrade.api.offers.events.OfferUpdated;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Consumes the offers module's own events after commit (Spring Modulith registry, own transaction,
 * retried after a crash) and hands them to {@link OfferActivity}: notifications and SYSTEM messages
 * in the pair conversation. Idempotent through their de-duplication keys.
 */
@Component
public class OfferActivityListener {

    private final OfferActivity activity;

    public OfferActivityListener(OfferActivity activity) {
        this.activity = activity;
    }

    @ApplicationModuleListener
    void on(OfferCreated event) {
        activity.created(event);
    }

    @ApplicationModuleListener
    void on(OfferUpdated event) {
        activity.updated(event);
    }
}
