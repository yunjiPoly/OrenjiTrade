package com.orenjitrade.api.delisting.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.delisting.domain.DelistPolicyService.PolicyChange;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Pure strike and pause rules (Phase 7 "Strikes"). */
class StrikeRulesTest {

    static final Instant NOW = Instant.parse("2026-09-30T12:00:00Z");

    @Test
    void strikesCountConversationsWaitingSinceTheLastResume() {
        List<Instant> waiting =
                List.of(
                        NOW.minus(Duration.ofDays(20)),
                        NOW.minus(Duration.ofDays(10)),
                        NOW.minus(Duration.ofDays(4)));
        assertThat(DelistJob.strikes(waiting, null)).isEqualTo(3);
        assertThat(DelistJob.strikes(waiting, NOW.minus(Duration.ofDays(12)))).isEqualTo(2);
        assertThat(DelistJob.strikes(waiting, NOW)).isZero();
        assertThat(DelistJob.strikes(List.of(), null)).isZero();
    }

    @Test
    void pausesHoldUntilResumedOrTheirEnd() {
        assertThat(ListingPauseRules.isPaused(null, null, NOW)).isFalse();
        assertThat(ListingPauseRules.isPaused(NOW.minusSeconds(60), null, NOW)).isTrue();
        assertThat(ListingPauseRules.isPaused(NOW.minusSeconds(60), NOW.plusSeconds(60), NOW))
                .isTrue();
        assertThat(ListingPauseRules.isPaused(NOW.minusSeconds(60), NOW, NOW)).isFalse();
        assertThat(PauseSource.UNRESPONSIVE.ownerCanResume()).isTrue();
        assertThat(PauseSource.REPORT_THRESHOLD.ownerCanResume()).isFalse();
        assertThat(PauseSource.MODERATION.ownerCanResume()).isFalse();
        assertThat(PauseSource.ADMIN.ownerCanResume()).isFalse();
        assertThat(ListingPauseRules.NOT_PAUSED).contains("u.id").contains(":now");
    }

    @Test
    void theUnansweredWindowIsPolicyData() {
        FreshnessPolicy policy =
                new FreshnessPolicy(UUID.randomUUID(), "Default", 15, 31, 46, 5, 3, null, NOW, 72);
        assertThat(policy.unansweredCutoff(NOW)).isEqualTo(NOW.minus(Duration.ofHours(72)));
        assertThat(
                        new FreshnessPolicy(
                                        UUID.randomUUID(), "Default", 15, 31, 46, 5, 3, null, NOW)
                                .unansweredAfterHours())
                .isEqualTo(FreshnessPolicy.DEFAULT_UNANSWERED_AFTER_HOURS);
        assertThat(DelistPolicyService.validate(new PolicyChange(null, 15, 31, 46, 5, 3, 72)))
                .isEmpty();
        assertThat(DelistPolicyService.validate(new PolicyChange(null, 15, 31, 46, 5, 3, 0)))
                .extracting(ProblemFieldError::field)
                .containsExactly("unansweredAfterHours");
        assertThat(DelistPolicyService.validate(new PolicyChange(null, 15, 31, 46, 5, 3, 721)))
                .extracting(ProblemFieldError::field)
                .containsExactly("unansweredAfterHours");
    }

    @Test
    void listingStatusOffersResumeOnlyForJobPauses() {
        UUID user = UUID.randomUUID();
        assertThat(
                        new ListingStatus(
                                        user,
                                        true,
                                        PauseSource.UNRESPONSIVE,
                                        null,
                                        NOW,
                                        null,
                                        3,
                                        3,
                                        3,
                                        NOW)
                                .canResume())
                .isTrue();
        assertThat(
                        new ListingStatus(
                                        user, true, PauseSource.ADMIN, "x", NOW, null, 0, 0, 3, NOW)
                                .canResume())
                .isFalse();
        assertThat(
                        new ListingStatus(user, false, null, null, null, null, 0, 0, 3, null)
                                .canResume())
                .isFalse();
    }
}
