package com.orenjitrade.api.users.domain;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Aggregates every registered {@link OnboardingCheck} into an {@link OnboardingStatus}. */
@Service
public class OnboardingService {

    private final List<OnboardingCheck> checks;

    public OnboardingService(List<OnboardingCheck> checks) {
        this.checks = List.copyOf(checks);
    }

    public OnboardingStatus statusOf(UUID userId) {
        Map<OnboardingFlag, Boolean> flags = new EnumMap<>(OnboardingFlag.class);
        for (OnboardingCheck check : checks) {
            if (flags.getOrDefault(check.flag(), false)) {
                continue; // already satisfied by another check
            }
            flags.put(check.flag(), check.isSatisfied(userId));
        }
        return new OnboardingStatus(
                flags.getOrDefault(OnboardingFlag.PROFILE_COMPLETE, false),
                flags.getOrDefault(OnboardingFlag.LOCATION_SET, false),
                flags.getOrDefault(OnboardingFlag.INTERESTS_SET, false),
                flags.getOrDefault(OnboardingFlag.AGE_CONFIRMED, false));
    }
}
