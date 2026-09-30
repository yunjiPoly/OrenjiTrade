package com.orenjitrade.api.moderation.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.common.ApiException;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Validation of admin-edited moderation rules (kind/scope combinations and patterns). */
class ModerationRuleValidationTest {

    @Test
    void kindsApplyToTheirScopesOnly() {
        assertThat(ModerationRuleService.scopesOf(ModerationRuleKind.REPORT_THRESHOLD))
                .containsExactly(ModerationScope.REPORT);
        assertThat(ModerationRuleService.scopesOf(ModerationRuleKind.RATE_LIMIT))
                .contains(ModerationScope.REPORT, ModerationScope.MESSAGE)
                .doesNotContain(ModerationScope.TAG);
        assertThat(ModerationRuleService.scopesOf(ModerationRuleKind.BANNED_TERM))
                .doesNotContain(ModerationScope.REPORT);
        assertInvalid(ModerationRuleKind.BANNED_TERM, ModerationScope.REPORT, "zorblax", "scope");
        assertInvalid(ModerationRuleKind.THRESHOLD, ModerationScope.REPORT, "3/60", "scope");
    }

    @Test
    void patternsAreRegularExpressionsOrRates() {
        assertThat(
                        ModerationRuleService.validate(
                                ModerationRuleKind.BANNED_TERM, ModerationScope.POST, "  scam+  "))
                .isEqualTo("scam+");
        assertThat(
                        ModerationRuleService.validate(
                                ModerationRuleKind.REPORT_THRESHOLD,
                                ModerationScope.REPORT,
                                "3/604800"))
                .isEqualTo("3/604800");
        assertInvalid(ModerationRuleKind.BANNED_TERM, ModerationScope.POST, "(unclosed", "pattern");
        assertInvalid(
                ModerationRuleKind.RATE_LIMIT, ModerationScope.REPORT, "five a day", "pattern");
        assertInvalid(ModerationRuleKind.RATE_LIMIT, ModerationScope.REPORT, "0/60", "pattern");
        assertInvalid(ModerationRuleKind.BANNED_TERM, ModerationScope.POST, " ", "pattern");
        assertInvalid(
                ModerationRuleKind.BANNED_TERM, ModerationScope.POST, "x".repeat(201), "pattern");
    }

    @Test
    void reportThresholdRulesParseLikeRateRules() {
        assertThat(RateRule.parse(UUID.randomUUID(), "3/604800", ModerationAction.BLOCK))
                .hasValueSatisfying(
                        rule -> {
                            assertThat(rule.limit()).isEqualTo(3);
                            assertThat(rule.windowSeconds()).isEqualTo(604_800);
                        });
    }

    private static void assertInvalid(
            ModerationRuleKind kind, ModerationScope scope, String pattern, String field) {
        assertThatThrownBy(() -> ModerationRuleService.validate(kind, scope, pattern))
                .isInstanceOf(ApiException.class)
                .satisfies(
                        error ->
                                assertThat(((ApiException) error).getFieldErrors())
                                        .anySatisfy(
                                                fieldError ->
                                                        assertThat(fieldError.field())
                                                                .isEqualTo(field)));
    }
}
