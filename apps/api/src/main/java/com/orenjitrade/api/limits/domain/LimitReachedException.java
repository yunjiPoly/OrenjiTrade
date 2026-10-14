package com.orenjitrade.api.limits.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import org.springframework.http.HttpStatus;

/**
 * {@code 429 LIMIT_REACHED} with the extensions {@code limitKey}, {@code limit}, {@code used} and
 * {@code resetsAt} (absent for TOTAL windows and caps). Clients say plainly which limit was reached
 * and, for daily or monthly limits, when it resets; nothing is sold to lift it (ADR 0019).
 */
public class LimitReachedException extends ApiException {

    private final LimitDecision decision;

    public LimitReachedException(LimitDecision decision) {
        super(
                ErrorCode.LIMIT_REACHED,
                HttpStatus.TOO_MANY_REQUESTS,
                "You have reached the limit for this action");
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
    }

    public LimitDecision decision() {
        return decision;
    }
}
