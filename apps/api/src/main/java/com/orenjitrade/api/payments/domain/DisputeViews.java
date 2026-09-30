package com.orenjitrade.api.payments.domain;

import com.orenjitrade.api.payments.domain.PaymentRows.DisputeEventRow;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeMessageRow;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeNoteRow;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeRow;
import com.orenjitrade.api.payments.domain.PaymentRows.EvidenceRow;
import com.orenjitrade.api.payments.domain.PaymentRows.PaymentEventRow;
import com.orenjitrade.api.payments.domain.PaymentRows.PaymentRow;
import com.orenjitrade.api.payments.domain.PaymentRows.RefundRow;
import com.orenjitrade.api.payments.domain.PaymentRows.ShipmentRow;
import com.orenjitrade.api.payments.domain.PaymentRows.WebhookEventRow;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.ratings.domain.RatingService.RatingSummaryView;
import com.orenjitrade.api.reports.domain.ModerationHistoryService.ModerationHistory;
import com.orenjitrade.api.trades.domain.TradeRow;
import com.orenjitrade.api.trades.domain.TradeViews.TimelineEntry;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Read models of disputes (assembled by {@link DisputeService}). */
public final class DisputeViews {

    private DisputeViews() {}

    /** Who looks at a dispute. */
    public enum ViewerRole {
        BUYER,
        SELLER,
        ADMIN
    }

    /**
     * A dispute as its parties and admins see it ({@code GET /disputes/{id}}).
     *
     * @param dispute the dispute
     * @param trade its trade
     * @param payment its payment
     * @param shipment the shipping confirmation, if any
     * @param viewerRole who looks
     * @param evidence evidence of both parties, oldest first
     * @param events timeline, oldest first
     * @param messages thread, oldest first
     * @param members cards of the parties and authors, by id
     * @param summary the trade's terms as text
     * @param canAddEvidence whether the viewer may add evidence now
     * @param canPostMessage whether the viewer may post in the thread now
     * @param evidenceLeft evidence items the viewer may still add
     */
    public record DisputeView(
            DisputeRow dispute,
            TradeRow trade,
            PaymentRow payment,
            @Nullable ShipmentRow shipment,
            ViewerRole viewerRole,
            List<EvidenceRow> evidence,
            List<DisputeEventRow> events,
            List<DisputeMessageRow> messages,
            Map<UUID, MemberCard> members,
            String summary,
            boolean canAddEvidence,
            boolean canPostMessage,
            int evidenceLeft) {}

    /**
     * The admin console's dispute detail: the member view plus internal notes, the trade timeline,
     * the payment history, refunds, webhooks and both parties' account histories and ratings.
     */
    public record AdminDisputeView(
            DisputeView view,
            List<DisputeNoteRow> notes,
            List<TimelineEntry> tradeTimeline,
            List<PaymentEventRow> paymentEvents,
            List<RefundRow> refunds,
            List<WebhookEventRow> webhooks,
            ModerationHistory buyerHistory,
            ModerationHistory sellerHistory,
            RatingSummaryView buyerRatings,
            RatingSummaryView sellerRatings) {}

    /**
     * A line of the admin dispute queue.
     *
     * @param dispute the dispute
     * @param payment its payment
     * @param buyer the buyer's card
     * @param seller the seller's card
     */
    public record AdminDisputeLine(
            DisputeRow dispute,
            @Nullable PaymentRow payment,
            @Nullable MemberCard buyer,
            @Nullable MemberCard seller) {}
}
