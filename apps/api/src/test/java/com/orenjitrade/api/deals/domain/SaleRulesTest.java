package com.orenjitrade.api.deals.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.common.ProblemFieldError;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The pure rules of Mark as sold (stage R4): copies sold, tracking numbers, the undo window. */
class SaleRulesTest {

    private static final Instant SOLD = Instant.parse("2026-10-15T12:00:00Z");

    @Test
    void copiesAreAtLeastOneAndADeckCoreSellsAsOne() {
        assertThat(SaleRules.validate(1, null, false)).isEmpty();
        assertThat(SaleRules.validate(9999, null, false)).isEmpty();
        assertThat(fields(SaleRules.validate(0, null, false))).containsExactly("quantity");
        assertThat(fields(SaleRules.validate(-2, null, false))).containsExactly("quantity");
        assertThat(fields(SaleRules.validate(10_000, null, false))).containsExactly("quantity");
        assertThat(SaleRules.validate(1, null, true)).isEmpty();
        assertThat(SaleRules.validate(2, null, true))
                .singleElement()
                .satisfies(error -> assertThat(error.message()).contains("deck core"));
    }

    @Test
    void trackingNumbersAreTrimmedAndOnlyLettersDigitsSpacesDotsAndDashes() {
        assertThat(SaleRules.tracking(null)).isNull();
        assertThat(SaleRules.tracking("   ")).isNull();
        assertThat(SaleRules.tracking("  7023 2109\t 8876  5432 "))
                .isEqualTo("7023 2109 8876 5432");
        for (String ok :
                List.of("7023 2109 8876 5432", "LX123456789CA", "1Z999AA10123456784", "AB-12.3")) {
            assertThat(SaleRules.validate(1, SaleRules.tracking(ok), false)).as(ok).isEmpty();
        }
        for (String bad :
                List.of("see https://x.io", "-123", "12#4", "a;b", "<b>1</b>", "1".repeat(65))) {
            assertThat(fields(SaleRules.validate(1, SaleRules.tracking(bad), false)))
                    .as(bad)
                    .containsExactly("trackingNumber");
        }
        assertThat(SaleRules.validate(1, "1".repeat(64), false)).isEmpty();
    }

    @Test
    void aSaleCanBeUndoneForTenMinutes() {
        assertThat(SaleRules.UNDO_WINDOW).isEqualTo(Duration.ofMinutes(10));
        assertThat(SaleRules.undoableUntil(SOLD)).isEqualTo(SOLD.plus(Duration.ofMinutes(10)));
        assertThat(SaleRules.undoable(SOLD, SOLD)).isTrue();
        assertThat(SaleRules.undoable(SOLD, SOLD.plusSeconds(599))).isTrue();
        assertThat(SaleRules.undoable(SOLD, SOLD.plusSeconds(600))).isFalse();
        assertThat(SaleRules.undoable(SOLD, SOLD.plusSeconds(3600))).isFalse();
    }

    @Test
    void theMessageIsNeutralAndTheNotificationNamesTheSeller() {
        assertThat(SaleRules.messageBody("theo.duels", "Ash Blossom", "sam.trades"))
                .isEqualTo("theo.duels marked Ash Blossom as sold to sam.trades.");
        assertThat(SaleRules.notificationTitle("theo.duels", "Ash Blossom"))
                .isEqualTo("theo.duels marked Ash Blossom as sold to you");
    }

    private static List<String> fields(List<ProblemFieldError> errors) {
        return errors.stream().map(ProblemFieldError::field).toList();
    }
}
