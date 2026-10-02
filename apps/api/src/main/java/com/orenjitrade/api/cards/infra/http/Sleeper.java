package com.orenjitrade.api.cards.infra.http;

import java.time.Duration;

/** Waits; replaced by a recording fake in tests so rate-limit and backoff tests take no time. */
@FunctionalInterface
public interface Sleeper {

    Sleeper SYSTEM =
            duration -> {
                if (!duration.isNegative() && !duration.isZero()) {
                    Thread.sleep(duration);
                }
            };

    void sleep(Duration duration) throws InterruptedException;
}
