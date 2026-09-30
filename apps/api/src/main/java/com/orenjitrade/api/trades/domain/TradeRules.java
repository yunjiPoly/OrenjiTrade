package com.orenjitrade.api.trades.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.offers.domain.OfferRole;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.ArrayList;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * Pure trade rules (Phase 8 contract "Trades"): which operation each status allows and the next
 * action shown on the trade page.
 *
 * <ul>
 *   <li>meetup: AGREED or AWAITING_PAYMENT; both parties mark it (an in-person meetup drops payment
 *       protection: AWAITING_PAYMENT goes back to AGREED);
 *   <li>complete: AGREED only (protected trades complete through Phase 9's receipt confirmation);
 *       both parties confirm → COMPLETED;
 *   <li>cancel: before any payment (AGREED, AWAITING_PAYMENT).
 * </ul>
 */
public final class TradeRules {

    private TradeRules() {}

    /** What a party does next ({@code nextAction.action}). */
    @Schema(name = "TradeNextActionKind")
    public enum Action {
        /** Pay through payment protection (Phase 9). */
        PAY,
        /** Ship the card (Phase 9). */
        SHIP,
        /** Confirm the card arrived (Phase 9). */
        CONFIRM_RECEIPT,
        /** Meet or exchange, then confirm the trade ({@code POST /trades/{id}/complete}). */
        MEET,
        /** Nothing left to do. */
        NONE
    }

    /** An operation a party may call now ({@code allowedOperations}). */
    @Schema(name = "TradeOperation")
    public enum Operation {
        /** {@code POST /trades/{id}/meetup}. */
        MARK_MEETUP,
        /** {@code POST /trades/{id}/complete}. */
        CONFIRM_COMPLETION,
        /** {@code POST /trades/{id}/cancel}. */
        CANCEL
    }

    /**
     * The next action of a trade.
     *
     * @param actor the party who acts ({@code null} with NONE)
     * @param action what they do
     */
    @Schema(name = "TradeNextAction", description = "Who acts next on a trade and how")
    public record NextAction(
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable OfferRole actor,
            @Schema(requiredMode = RequiredMode.REQUIRED) Action action) {

        public static final NextAction NONE = new NextAction(null, Action.NONE);
    }

    public static boolean canMarkMeetup(TradeStatus status) {
        return status == TradeStatus.AGREED || status == TradeStatus.AWAITING_PAYMENT;
    }

    public static boolean canComplete(TradeStatus status) {
        return status == TradeStatus.AGREED;
    }

    public static boolean canCancel(TradeStatus status) {
        return status == TradeStatus.AGREED || status == TradeStatus.AWAITING_PAYMENT;
    }

    /**
     * The next action for a viewer: in an AGREED trade the viewer meets and confirms first unless
     * they already confirmed; protected trades follow the Phase 9 steps.
     */
    public static NextAction nextAction(
            TradeStatus status,
            boolean buyerConfirmed,
            boolean sellerConfirmed,
            @Nullable OfferRole viewer) {
        return switch (status) {
            case AGREED -> {
                OfferRole first = viewer == null ? OfferRole.BUYER : viewer;
                if (!confirmed(first, buyerConfirmed, sellerConfirmed)) {
                    yield new NextAction(first, Action.MEET);
                }
                OfferRole other = first.other();
                yield confirmed(other, buyerConfirmed, sellerConfirmed)
                        ? NextAction.NONE
                        : new NextAction(other, Action.MEET);
            }
            case AWAITING_PAYMENT -> new NextAction(OfferRole.BUYER, Action.PAY);
            case PAID -> new NextAction(OfferRole.SELLER, Action.SHIP);
            case SHIPPED -> new NextAction(OfferRole.BUYER, Action.CONFIRM_RECEIPT);
            case RECEIVED, COMPLETED, CANCELLED, DISPUTED -> NextAction.NONE;
        };
    }

    /** The operations a party may call now. */
    public static List<Operation> operations(
            TradeStatus status,
            OfferRole viewer,
            boolean viewerMarkedMeetup,
            boolean viewerConfirmed) {
        List<Operation> result = new ArrayList<>();
        if (canMarkMeetup(status) && !viewerMarkedMeetup) {
            result.add(Operation.MARK_MEETUP);
        }
        if (canComplete(status) && !viewerConfirmed) {
            result.add(Operation.CONFIRM_COMPLETION);
        }
        if (canCancel(status)) {
            result.add(Operation.CANCEL);
        }
        return List.copyOf(result);
    }

    private static boolean confirmed(
            OfferRole role, boolean buyerConfirmed, boolean sellerConfirmed) {
        return role == OfferRole.BUYER ? buyerConfirmed : sellerConfirmed;
    }
}
