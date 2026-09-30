package com.orenjitrade.api.reports.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.reports.domain.AdminReportService.Resolution;
import java.time.Instant;
import java.util.Arrays;
import org.junit.jupiter.api.Test;

/**
 * Pure report rules: decision combinations, admin-only actions, the threshold and the lifecycle.
 */
class ReportRulesTest {

    @Test
    void decisionsCombineStatusAndAction() {
        assertThat(
                        AdminReportService.validate(
                                new Resolution(
                                        ReportStatus.DISMISSED, null, "No issue", false, null)))
                .isEqualTo(ResolutionAction.NONE);
        assertThat(
                        AdminReportService.validate(
                                new Resolution(
                                        ReportStatus.ACTIONED,
                                        ResolutionAction.WARNING,
                                        "Warned",
                                        true,
                                        null)))
                .isEqualTo(ResolutionAction.WARNING);
        assertThat(
                        AdminReportService.validate(
                                new Resolution(
                                        ReportStatus.ACTIONED,
                                        ResolutionAction.SUSPENDED,
                                        "Scam",
                                        true,
                                        Instant.parse("2026-12-01T00:00:00Z"))))
                .isEqualTo(ResolutionAction.SUSPENDED);
        assertInvalid(new Resolution(ReportStatus.ACTIONED, null, "x", false, null), "action");
        assertInvalid(
                new Resolution(ReportStatus.DISMISSED, ResolutionAction.BANNED, "x", false, null),
                "action");
        assertInvalid(
                new Resolution(ReportStatus.OPEN, ResolutionAction.NONE, "x", false, null),
                "status");
        assertInvalid(
                new Resolution(ReportStatus.ACTIONED, ResolutionAction.WARNING, " ", false, null),
                "note");
        assertInvalid(
                new Resolution(
                        ReportStatus.ACTIONED,
                        ResolutionAction.WARNING,
                        "x",
                        false,
                        Instant.parse("2026-12-01T00:00:00Z")),
                "suspendUntil");
    }

    @Test
    void onlySuspensionsAndBansNeedAnAdmin() {
        assertThat(Arrays.stream(ResolutionAction.values()).filter(ResolutionAction::needsAdmin))
                .containsExactly(ResolutionAction.SUSPENDED, ResolutionAction.BANNED);
    }

    @Test
    void thresholdAndLifecycle() {
        assertThat(ReportThresholdService.reached(2, 3)).isFalse();
        assertThat(ReportThresholdService.reached(3, 3)).isTrue();
        assertThat(ReportThresholdService.reached(5, 3)).isTrue();
        assertThat(ReportStatus.OPEN.isOpen()).isTrue();
        assertThat(ReportStatus.UNDER_REVIEW.isOpen()).isTrue();
        assertThat(ReportStatus.ACTIONED.isOpen()).isFalse();
        assertThat(ReportStatus.DISMISSED.isOpen()).isFalse();
        assertThat(ReportReason.values()).hasSize(7);
        assertThat(ReportReason.values()[0]).isEqualTo(ReportReason.SCAM);
        assertThat(ReportReason.OTHER.label()).isNotBlank();
    }

    private static void assertInvalid(Resolution resolution, String field) {
        assertThatThrownBy(() -> AdminReportService.validate(resolution))
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
