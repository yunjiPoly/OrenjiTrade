package com.orenjitrade.api.offers.domain;

import java.util.ArrayList;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * The offer state machine of the Phase 8 contract (pure):
 *
 * <pre>
 * OPEN      --COUNTER (turn)--> COUNTERED (the answered proposal; the counter-offer is a new
 *                               COUNTERED row whose turn is the other party)
 * OPEN      --ACCEPT (turn)---> ACCEPTED   --DECLINE (turn)--> DECLINED
 * OPEN      --CANCEL (buyer)--> CANCELLED  --expiry----------> EXPIRED
 * COUNTERED --COUNTER | ACCEPT | DECLINE (turn), expiry --> COUNTERED | ACCEPTED | DECLINED | EXPIRED
 * ACCEPTED, DECLINED, CANCELLED, EXPIRED: terminal
 * </pre>
 *
 * Only the live proposal of a chain (not superseded by a counter-offer) can move; acting on a
 * superseded proposal is stale. Only the party whose turn it is may counter, accept or decline;
 * only the buyer may cancel, and only while the first proposal is OPEN.
 */
public final class OfferStateMachine {

    private OfferStateMachine() {}

    /** Why an action is refused. */
    public enum Refusal {
        /** The proposal was replaced by a counter-offer (409 STALE_OFFER). */
        SUPERSEDED,
        /** The status does not allow the action (409 INVALID_STATE_TRANSITION). */
        INVALID_STATE,
        /** The other party has to answer first (409 NOT_YOUR_TURN). */
        NOT_YOUR_TURN,
        /** Only the buyer may withdraw an offer (403 FORBIDDEN). */
        BUYER_ONLY
    }

    /**
     * Outcome of {@link #decide}: the status the acted-on proposal takes, or the refusal.
     *
     * @param next new status of the proposal ({@code null} when refused)
     * @param refusal why the action is refused ({@code null} when allowed)
     */
    public record Decision(@Nullable OfferStatus next, @Nullable Refusal refusal) {

        static Decision to(OfferStatus next) {
            return new Decision(next, null);
        }

        static Decision refuse(Refusal refusal) {
            return new Decision(null, refusal);
        }

        public boolean allowed() {
            return refusal == null;
        }
    }

    /**
     * Decides a party's action on a proposal.
     *
     * @param status current status of the proposal
     * @param superseded whether a counter-offer replaced it
     * @param turn the party expected to answer ({@code current_turn})
     * @param actor the acting party
     * @param action the action
     */
    public static Decision decide(
            OfferStatus status,
            boolean superseded,
            OfferRole turn,
            OfferRole actor,
            OfferAction action) {
        if (superseded) {
            return Decision.refuse(Refusal.SUPERSEDED);
        }
        if (!status.isPending()) {
            return Decision.refuse(Refusal.INVALID_STATE);
        }
        return switch (action) {
            case CANCEL -> {
                if (actor != OfferRole.BUYER) {
                    yield Decision.refuse(Refusal.BUYER_ONLY);
                }
                yield status == OfferStatus.OPEN
                        ? Decision.to(OfferStatus.CANCELLED)
                        : Decision.refuse(Refusal.INVALID_STATE);
            }
            case COUNTER, ACCEPT, DECLINE -> {
                if (actor != turn) {
                    yield Decision.refuse(Refusal.NOT_YOUR_TURN);
                }
                yield Decision.to(
                        switch (action) {
                            case COUNTER -> OfferStatus.COUNTERED;
                            case ACCEPT -> OfferStatus.ACCEPTED;
                            default -> OfferStatus.DECLINED;
                        });
            }
        };
    }

    /** Whether the expiry job may expire a proposal (a live OPEN or COUNTERED one). */
    public static boolean canExpire(OfferStatus status, boolean superseded) {
        return !superseded && status.isPending();
    }

    /** The actions {@code viewer} may take on a proposal right now, in display order. */
    public static List<OfferAction> allowedActions(
            OfferStatus status, boolean superseded, OfferRole turn, OfferRole viewer) {
        List<OfferAction> allowed = new ArrayList<>();
        for (OfferAction action :
                List.of(
                        OfferAction.ACCEPT,
                        OfferAction.COUNTER,
                        OfferAction.DECLINE,
                        OfferAction.CANCEL)) {
            if (decide(status, superseded, turn, viewer, action).allowed()) {
                allowed.add(action);
            }
        }
        return List.copyOf(allowed);
    }
}
