package com.orenjitrade.api.users.domain;

import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The {@code ageConfirmed} onboarding flag of {@code GET /api/v1/me}: true once the collector
 * recorded the {@link LegalDocumentType#AGE_CONFIRMATION} consent. Clients show the confirmation
 * step of the onboarding flow while it is false (existing accounts included).
 */
@Component
public class AgeConfirmedCheck implements OnboardingCheck {

    private final ConsentService consentService;

    public AgeConfirmedCheck(ConsentService consentService) {
        this.consentService = consentService;
    }

    @Override
    public OnboardingFlag flag() {
        return OnboardingFlag.AGE_CONFIRMED;
    }

    @Override
    public boolean isSatisfied(UUID userId) {
        return consentService.hasConfirmedAge(userId);
    }
}
