package com.orenjitrade.api.trades.domain;

import com.orenjitrade.api.offers.domain.OfferRole;
import com.orenjitrade.api.offers.domain.OfferViews;
import com.orenjitrade.api.trades.domain.TradeRules.NextAction;
import com.orenjitrade.api.trades.domain.TradeRules.Operation;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/** Read models of the trades module (assembled by {@link TradeService}). */
public final class TradeViews {

    private TradeViews() {}

    /**
     * One timeline entry.
     *
     * @param event the stored event
     * @param actorRole the acting party's role ({@code null} for the platform)
     * @param details event data (ids, statuses, quantities, the cancel reason)
     */
    public record TimelineEntry(
            TradeEventRow event, @Nullable OfferRole actorRole, Map<String, Object> details) {}

    /**
     * A trade as one of its parties sees it ({@code GET /trades/{id}}).
     *
     * @param row the trade
     * @param offer the accepted proposal with its history
     * @param viewerRole the viewer's role
     * @param nextAction who acts next and how
     * @param operations what the viewer may call now
     * @param timeline the timeline, oldest first
     */
    public record Detail(
            TradeRow row,
            OfferViews.Detail offer,
            OfferRole viewerRole,
            NextAction nextAction,
            List<Operation> operations,
            List<TimelineEntry> timeline) {}

    /**
     * A line of {@code GET /trades}.
     *
     * @param row the trade
     * @param offer the accepted proposal (item and counterparty)
     * @param viewerRole the viewer's role
     * @param nextAction who acts next and how
     */
    public record Summary(
            TradeRow row, OfferViews.Summary offer, OfferRole viewerRole, NextAction nextAction) {}
}
