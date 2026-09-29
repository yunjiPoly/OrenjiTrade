package com.orenjitrade.api.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.async.*}: bounds of the application task executor used by {@code @Async} methods
 * and Spring Modulith event listeners.
 *
 * @param coreSize threads kept alive
 * @param maxSize upper bound once the queue is full
 * @param queueCapacity bounded queue; when full and all threads busy the caller runs the task
 * @param threadNamePrefix prefix of worker thread names
 * @param awaitTermination how long shutdown waits for in-flight tasks
 */
@ConfigurationProperties(prefix = "orenji.async")
public record AsyncProperties(
        @DefaultValue("4") int coreSize,
        @DefaultValue("16") int maxSize,
        @DefaultValue("500") int queueCapacity,
        @DefaultValue("orenji-async-") String threadNamePrefix,
        @DefaultValue("30s") Duration awaitTermination) {}
