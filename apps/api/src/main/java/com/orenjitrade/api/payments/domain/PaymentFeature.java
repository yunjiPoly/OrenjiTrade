package com.orenjitrade.api.payments.domain;

import com.orenjitrade.api.featureflags.domain.FeatureFlagKeys;
import com.orenjitrade.api.featureflags.domain.FeatureFlagView;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The {@code protectedPayments} flag guard of every payment route (Phase 9 contract: {@code 404
 * FEATURE_DISABLED} when off). Member routes evaluate the flag for the caller (seller account) or
 * for the trade's buyer (trade and dispute routes, like the acceptance that enabled protection, so
 * both parties of a protected trade see the same answer during a partial rollout); provider
 * webhooks and internal fake-payment routes need the flag on for at least part of the members.
 */
@Component
public class PaymentFeature {

    private final FeatureFlags featureFlags;

    public PaymentFeature(FeatureFlags featureFlags) {
        this.featureFlags = featureFlags;
    }

    /** {@code 404 FEATURE_DISABLED} unless the flag is on for {@code userId}. */
    public void requireFor(UUID userId) {
        featureFlags.require(FeatureFlagKeys.PROTECTED_PAYMENTS, userId);
    }

    /** Whether the flag is enabled with a rollout above 0 %. */
    public boolean activeForAnyone() {
        return featureFlags.all().stream()
                .filter(flag -> flag.key().equals(FeatureFlagKeys.PROTECTED_PAYMENTS))
                .findFirst()
                .map(PaymentFeature::active)
                .orElse(false);
    }

    /** {@code 404 FEATURE_DISABLED} unless {@link #activeForAnyone()}. */
    public void requireActive() {
        if (!activeForAnyone()) {
            throw FeatureFlags.disabled(FeatureFlagKeys.PROTECTED_PAYMENTS);
        }
    }

    private static boolean active(FeatureFlagView flag) {
        return flag.enabled() && flag.rolloutPercent() > 0;
    }
}
