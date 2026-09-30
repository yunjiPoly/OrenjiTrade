package com.orenjitrade.api.trades.domain;

import static com.orenjitrade.api.offers.domain.OfferRole.BUYER;
import static com.orenjitrade.api.offers.domain.OfferRole.SELLER;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.trades.domain.TradeRules.Action;
import com.orenjitrade.api.trades.domain.TradeRules.NextAction;
import com.orenjitrade.api.trades.domain.TradeRules.Operation;
import org.junit.jupiter.api.Test;

/** Pure trade rules: operations per status and the next action of the trade page. */
class TradeRulesTest {

    @Test
    void agreedTradesAreMetAndConfirmedByBothParties() {
        assertThat(TradeRules.nextAction(TradeStatus.AGREED, false, false, SELLER))
                .isEqualTo(new NextAction(SELLER, Action.MEET));
        assertThat(TradeRules.nextAction(TradeStatus.AGREED, false, false, BUYER))
                .isEqualTo(new NextAction(BUYER, Action.MEET));
        assertThat(TradeRules.nextAction(TradeStatus.AGREED, true, false, BUYER))
                .isEqualTo(new NextAction(SELLER, Action.MEET));
        assertThat(TradeRules.nextAction(TradeStatus.AGREED, true, true, BUYER))
                .isEqualTo(NextAction.NONE);
        assertThat(TradeRules.nextAction(TradeStatus.AGREED, false, false, null))
                .isEqualTo(new NextAction(BUYER, Action.MEET));
    }

    @Test
    void protectedTradesFollowThePaymentSteps() {
        assertThat(TradeRules.nextAction(TradeStatus.AWAITING_PAYMENT, false, false, SELLER))
                .isEqualTo(new NextAction(BUYER, Action.PAY));
        assertThat(TradeRules.nextAction(TradeStatus.PAID, false, false, BUYER))
                .isEqualTo(new NextAction(SELLER, Action.SHIP));
        assertThat(TradeRules.nextAction(TradeStatus.SHIPPED, false, false, SELLER))
                .isEqualTo(new NextAction(BUYER, Action.CONFIRM_RECEIPT));
        for (TradeStatus status :
                java.util.List.of(
                        TradeStatus.RECEIVED,
                        TradeStatus.COMPLETED,
                        TradeStatus.CANCELLED,
                        TradeStatus.DISPUTED)) {
            assertThat(TradeRules.nextAction(status, false, false, BUYER))
                    .isEqualTo(NextAction.NONE);
        }
    }

    @Test
    void operationsFollowTheStatus() {
        assertThat(TradeRules.operations(TradeStatus.AGREED, BUYER, false, false))
                .containsExactly(
                        Operation.MARK_MEETUP, Operation.CONFIRM_COMPLETION, Operation.CANCEL);
        assertThat(TradeRules.operations(TradeStatus.AGREED, BUYER, true, true))
                .containsExactly(Operation.CANCEL);
        assertThat(TradeRules.operations(TradeStatus.AWAITING_PAYMENT, SELLER, false, false))
                .containsExactly(Operation.MARK_MEETUP, Operation.CANCEL);
        for (TradeStatus status :
                java.util.List.of(
                        TradeStatus.PAID,
                        TradeStatus.SHIPPED,
                        TradeStatus.RECEIVED,
                        TradeStatus.COMPLETED,
                        TradeStatus.CANCELLED,
                        TradeStatus.DISPUTED)) {
            assertThat(TradeRules.operations(status, BUYER, false, false))
                    .doesNotContain(
                            Operation.MARK_MEETUP, Operation.CONFIRM_COMPLETION, Operation.CANCEL);
            assertThat(TradeRules.canCancel(status)).isFalse();
            assertThat(TradeRules.canComplete(status)).isFalse();
            assertThat(TradeRules.canMarkMeetup(status)).isFalse();
        }
        assertThat(TradeStatus.DISPUTED.isOpen()).isTrue();
        assertThat(TradeStatus.COMPLETED.isOpen()).isFalse();
    }

    @Test
    void protectedTradesOfferThePaymentStepsToTheRightParty() {
        assertThat(TradeRules.operations(TradeStatus.AWAITING_PAYMENT, BUYER, false, false, false))
                .containsExactly(Operation.PAY, Operation.MARK_MEETUP, Operation.CANCEL);
        assertThat(TradeRules.operations(TradeStatus.PAID, SELLER, false, false, true))
                .containsExactly(Operation.SHIP);
        assertThat(TradeRules.operations(TradeStatus.PAID, BUYER, false, false, true))
                .containsExactly(Operation.OPEN_DISPUTE);
        assertThat(TradeRules.operations(TradeStatus.PAID, BUYER, false, false, false)).isEmpty();
        assertThat(TradeRules.operations(TradeStatus.SHIPPED, BUYER, false, false, true))
                .containsExactly(Operation.CONFIRM_RECEIPT, Operation.OPEN_DISPUTE);
        assertThat(TradeRules.operations(TradeStatus.SHIPPED, SELLER, false, false, true))
                .isEmpty();
        assertThat(TradeRules.operations(TradeStatus.DISPUTED, BUYER, false, false, true))
                .isEmpty();
        assertThat(TradeRules.operations(TradeStatus.COMPLETED, BUYER, false, false, true))
                .isEmpty();
    }
}
