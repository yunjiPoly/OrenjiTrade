package com.orenjitrade.api.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/** The asking price as typed on the phone (stage R2): plain amounts, text, limits. */
class AskingPriceTextTest {

    @ParameterizedTest(name = "{0} is {1}")
    @CsvSource(
            delimiter = '|',
            value = {
                "12.50|12.50",
                "$12.50|12.50",
                "12,50 $|12.50",
                "12,50$|12.50",
                "$ 12|12.00",
                "12|12.00",
                "7.5|7.50",
                "0|0.00",
                "012|12.00",
                "  42.00  |42.00",
                "9999999999.99|9999999999.99"
            })
    void aPlainAmountGivesItsAmountWithTwoDecimals(String text, String amount) {
        assertThat(AskingPriceText.amountOf(text)).contains(new BigDecimal(amount));
        assertThat(AskingPriceText.amountOf(text).orElseThrow().scale()).isEqualTo(2);
    }

    @Test
    void theFrenchWayMayUseANoBreakSpace() {
        assertThat(AskingPriceText.amountOf("12,50 $")).contains(new BigDecimal("12.50"));
        assertThat(AskingPriceText.amountOf("12,50 $")).contains(new BigDecimal("12.50"));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "85% TCG",
                "Trade only",
                "12.",
                ".50",
                "12.505",
                "1,200.00",
                "1 200",
                "$12$",
                "12 CAD",
                "CA$12",
                "-5",
                "12345678901",
                "twelve",
                "€12"
            })
    void anyOtherTextHasNoAmount(String text) {
        assertThat(AskingPriceText.amountOf(text)).isEmpty();
    }

    @Test
    void blankTextIsNoPrice() {
        assertThat(AskingPriceText.normalise(null)).isNull();
        assertThat(AskingPriceText.normalise("   ")).isNull();
        assertThat(AskingPriceText.normalise("  85% TCG ")).isEqualTo("85% TCG");
        assertThat(AskingPriceText.amountOf(null)).isEmpty();
        assertThat(AskingPriceText.amountOf("")).isEmpty();
    }

    @Test
    void aTextIsOneLineOfAtMostFortyCharacters() {
        assertThat(AskingPriceText.problem(null)).isNull();
        assertThat(AskingPriceText.problem("x".repeat(40))).isNull();
        assertThat(AskingPriceText.problem("x".repeat(41))).contains("40");
        // Characters, not UTF-16 units: forty emoji are forty characters.
        assertThat(AskingPriceText.problem("🃏".repeat(40))).isNull();
        assertThat(AskingPriceText.problem("85%\nTCG")).contains("one line");
        assertThat(AskingPriceText.problem("85%\tTCG")).contains("one line");
    }
}
