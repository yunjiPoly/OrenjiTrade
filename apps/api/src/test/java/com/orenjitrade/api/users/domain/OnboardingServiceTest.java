package com.orenjitrade.api.users.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OnboardingServiceTest {

    private static final UUID USER = UUID.randomUUID();

    @Test
    void defaultsToFalseWithoutChecks() {
        assertThat(new OnboardingService(List.of()).statusOf(USER))
                .isEqualTo(OnboardingStatus.NONE);
    }

    @Test
    void aggregatesChecksPerFlagAndAnySatisfiedCheckWins() {
        OnboardingService service =
                new OnboardingService(
                        List.of(
                                check(OnboardingFlag.PROFILE_COMPLETE, false),
                                check(OnboardingFlag.PROFILE_COMPLETE, true),
                                check(OnboardingFlag.LOCATION_SET, true),
                                check(OnboardingFlag.LOCATION_SET, false),
                                check(OnboardingFlag.AGE_CONFIRMED, true)));

        OnboardingStatus status = service.statusOf(USER);

        assertThat(status.profileComplete()).isTrue();
        assertThat(status.locationSet()).isTrue();
        assertThat(status.interestsSet()).isFalse();
        assertThat(status.ageConfirmed()).isTrue();
    }

    @Test
    void ageConfirmedIsFalseWithoutItsCheck() {
        OnboardingService service =
                new OnboardingService(List.of(check(OnboardingFlag.PROFILE_COMPLETE, true)));

        assertThat(service.statusOf(USER).ageConfirmed()).isFalse();
    }

    private static OnboardingCheck check(OnboardingFlag flag, boolean satisfied) {
        return new OnboardingCheck() {
            @Override
            public OnboardingFlag flag() {
                return flag;
            }

            @Override
            public boolean isSatisfied(UUID userId) {
                assertThat(userId).isEqualTo(USER);
                return satisfied;
            }
        };
    }
}
