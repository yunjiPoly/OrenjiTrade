package com.orenjitrade.api.billing.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import org.springframework.http.HttpStatus;

/**
 * {@code 429 LIMIT_REACHED} with the extensions {@code limitKey}, {@code limit}, {@code used},
 * {@code resetsAt} (absent for TOTAL windows and caps), {@code planCode} and {@code upgradeUrl}.
 * Clients show a dialog explaining the limit and the premium benefit, never a silent failure.
 */
public class LimitReachedException extends ApiException {

    private final LimitDecision decision;

    public LimitReachedException(LimitDecision decision) {
        super(
                ErrorCode.LIMIT_REACHED,
                HttpStatus.TOO_MANY_REQUESTS,
                "You have reached the limit of your plan for this action");
        this.decision = decision;
        withProperty("limitKey", decision.key());
        if (decision.limit() != null) {
            withProperty("limit", decision.limit());
        }
        if (decision.used() != null) {
            withProperty("used", decision.used());
        }
        if (decision.resetsAt() != null) {
            withProperty("resetsAt", decision.resetsAt().toString());
        }
        withProperty("planCode", decision.planCode());
        withProperty("upgradeUrl", decision.upgradeUrl());
    }

    public LimitDecision decision() {
        return decision;
    }
}
