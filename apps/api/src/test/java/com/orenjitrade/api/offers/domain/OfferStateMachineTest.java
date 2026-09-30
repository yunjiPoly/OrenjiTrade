package com.orenjitrade.api.offers.domain;

import static com.orenjitrade.api.offers.domain.OfferAction.ACCEPT;
import static com.orenjitrade.api.offers.domain.OfferAction.CANCEL;
import static com.orenjitrade.api.offers.domain.OfferAction.COUNTER;
import static com.orenjitrade.api.offers.domain.OfferAction.DECLINE;
import static com.orenjitrade.api.offers.domain.OfferRole.BUYER;
import static com.orenjitrade.api.offers.domain.OfferRole.SELLER;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.offers.domain.OfferStateMachine.Decision;
import com.orenjitrade.api.offers.domain.OfferStateMachine.Refusal;
import java.util.EnumSet;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Every legal and illegal transition of the Phase 8 offer state machine. */
class OfferStateMachineTest {

    @Test
    void openOffersAreAnsweredByTheSellerOrWithdrawnByTheBuyer() {
        assertThat(next(OfferStatus.OPEN, SELLER, SELLER, ACCEPT)).isEqualTo(OfferStatus.ACCEPTED);
        assertThat(next(OfferStatus.OPEN, SELLER, SELLER, DECLINE)).isEqualTo(OfferStatus.DECLINED);
        assertThat(next(OfferStatus.OPEN, SELLER, SELLER, COUNTER))
                .isEqualTo(OfferStatus.COUNTERED);
        assertThat(next(OfferStatus.OPEN, SELLER, BUYER, CANCEL)).isEqualTo(OfferStatus.CANCELLED);

        assertThat(refusal(OfferStatus.OPEN, false, SELLER, BUYER, ACCEPT))
                .isEqualTo(Refusal.NOT_YOUR_TURN);
        assertThat(refusal(OfferStatus.OPEN, false, SELLER, BUYER, DECLINE))
                .isEqualTo(Refusal.NOT_YOUR_TURN);
        assertThat(refusal(OfferStatus.OPEN, false, SELLER, BUYER, COUNTER))
                .isEqualTo(Refusal.NOT_YOUR_TURN);
        assertThat(refusal(OfferStatus.OPEN, false, SELLER, SELLER, CANCEL))
                .isEqualTo(Refusal.BUYER_ONLY);
    }

    @Test
    void counterOffersAreAnsweredByThePartyWhoseTurnItIs() {
        for (OfferRole turn : OfferRole.values()) {
            assertThat(next(OfferStatus.COUNTERED, turn, turn, ACCEPT))
                    .isEqualTo(OfferStatus.ACCEPTED);
            assertThat(next(OfferStatus.COUNTERED, turn, turn, DECLINE))
                    .isEqualTo(OfferStatus.DECLINED);
            assertThat(next(OfferStatus.COUNTERED, turn, turn, COUNTER))
                    .isEqualTo(OfferStatus.COUNTERED);
            for (OfferAction action : List.of(ACCEPT, DECLINE, COUNTER)) {
                assertThat(refusal(OfferStatus.COUNTERED, false, turn, turn.other(), action))
                        .as("%s by %s while %s answers", action, turn.other(), turn)
                        .isEqualTo(Refusal.NOT_YOUR_TURN);
            }
        }
        assertThat(refusal(OfferStatus.COUNTERED, false, SELLER, BUYER, CANCEL))
                .as("a countered negotiation cannot be withdrawn")
                .isEqualTo(Refusal.INVALID_STATE);
        assertThat(refusal(OfferStatus.COUNTERED, false, BUYER, SELLER, CANCEL))
                .isEqualTo(Refusal.BUYER_ONLY);
    }

    @Test
    void terminalAndSupersededProposalsRefuseEverything() {
        for (OfferStatus status :
                EnumSet.of(
                        OfferStatus.ACCEPTED,
                        OfferStatus.DECLINED,
                        OfferStatus.CANCELLED,
                        OfferStatus.EXPIRED)) {
            for (OfferAction action : OfferAction.values()) {
                for (OfferRole actor : OfferRole.values()) {
                    assertThat(refusal(status, false, SELLER, actor, action))
                            .as("%s on %s", action, status)
                            .isEqualTo(Refusal.INVALID_STATE);
                }
            }
            assertThat(OfferStateMachine.canExpire(status, false)).isFalse();
            assertThat(OfferStateMachine.allowedActions(status, false, SELLER, SELLER)).isEmpty();
        }
        for (OfferAction action : OfferAction.values()) {
            assertThat(refusal(OfferStatus.COUNTERED, true, SELLER, SELLER, action))
                    .isEqualTo(Refusal.SUPERSEDED);
        }
        assertThat(OfferStateMachine.canExpire(OfferStatus.COUNTERED, true)).isFalse();
        assertThat(OfferStateMachine.canExpire(OfferStatus.COUNTERED, false)).isTrue();
        assertThat(OfferStateMachine.canExpire(OfferStatus.OPEN, false)).isTrue();
    }

    @Test
    void allowedActionsFollowTheTurn() {
        assertThat(OfferStateMachine.allowedActions(OfferStatus.OPEN, false, SELLER, SELLER))
                .containsExactly(ACCEPT, COUNTER, DECLINE);
        assertThat(OfferStateMachine.allowedActions(OfferStatus.OPEN, false, SELLER, BUYER))
                .containsExactly(CANCEL);
        assertThat(OfferStateMachine.allowedActions(OfferStatus.COUNTERED, false, BUYER, BUYER))
                .containsExactly(ACCEPT, COUNTER, DECLINE);
        assertThat(OfferStateMachine.allowedActions(OfferStatus.COUNTERED, false, BUYER, SELLER))
                .isEmpty();
        assertThat(OfferStateMachine.allowedActions(OfferStatus.COUNTERED, true, BUYER, BUYER))
                .isEmpty();
    }

    private static OfferStatus next(
            OfferStatus status, OfferRole turn, OfferRole actor, OfferAction action) {
        Decision decision = OfferStateMachine.decide(status, false, turn, actor, action);
        assertThat(decision.allowed()).as("%s %s by %s", status, action, actor).isTrue();
        return decision.next();
    }

    private static Refusal refusal(
            OfferStatus status,
            boolean superseded,
            OfferRole turn,
            OfferRole actor,
            OfferAction action) {
        Decision decision = OfferStateMachine.decide(status, superseded, turn, actor, action);
        assertThat(decision.allowed()).as("%s %s by %s", status, action, actor).isFalse();
        return decision.refusal();
    }
}
