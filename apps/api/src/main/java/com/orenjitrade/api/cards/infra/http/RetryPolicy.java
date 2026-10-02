package com.orenjitrade.api.cards.infra.http;

import java.time.Duration;

/**
 * Retry of transient provider failures (timeouts, connection errors, 5xx, 429): exponential backoff
 * {@code initialBackoff * 2^(attempt-1)} capped at {@code maxBackoff}; a {@code Retry-After} header
 * wins when it is longer, up to {@code maxRetryAfter} (a longer demand gives up). Other 4xx answers
 * are never retried.
 *
 * @param maxAttempts total attempts (first try included), at least 1
 * @param initialBackoff wait before the second attempt
 * @param maxBackoff longest computed wait
 * @param maxRetryAfter longest {@code Retry-After} the client honours
 */
public record RetryPolicy(
        int maxAttempts, Duration initialBackoff, Duration maxBackoff, Duration maxRetryAfter) {

    public RetryPolicy {
        if (maxAttempts < 1 || maxAttempts > 10) {
            throw new IllegalArgumentException("maxAttempts must be between 1 and 10");
        }
        if (initialBackoff.isNegative() || maxBackoff.isNegative() || maxRetryAfter.isNegative()) {
            throw new IllegalArgumentException("Backoff durations must not be negative");
        }
    }

    /** Wait before attempt {@code nextAttempt} (2 = first retry). */
    public Duration backoff(int nextAttempt) {
        long factor = 1L << Math.min(20, Math.max(0, nextAttempt - 2));
        Duration computed = initialBackoff.multipliedBy(factor);
        return computed.compareTo(maxBackoff) > 0 ? maxBackoff : computed;
    }
}
