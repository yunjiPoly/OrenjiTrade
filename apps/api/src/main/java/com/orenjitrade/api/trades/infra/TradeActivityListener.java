package com.orenjitrade.api.trades.infra;

import com.orenjitrade.api.trades.domain.TradeActivity;
import com.orenjitrade.api.trades.events.TradeUpdated;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Consumes {@link TradeUpdated} after commit (Spring Modulith registry, own transaction, retried
 * after a crash) and hands it to {@link TradeActivity}. Idempotent through the de-duplication keys.
 */
@Component
public class TradeActivityListener {

    private final TradeActivity activity;

    public TradeActivityListener(TradeActivity activity) {
        this.activity = activity;
    }

    @ApplicationModuleListener
    void on(TradeUpdated event) {
        activity.updated(event);
    }
}
