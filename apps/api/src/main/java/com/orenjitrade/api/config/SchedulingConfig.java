package com.orenjitrade.api.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * {@code @Scheduled} jobs run only under the {@code local} profile, standing in for Cloud
 * Scheduler; deployed environments trigger the same work through {@code POST /internal/jobs/*}.
 * {@code orenji.scheduling.enabled=false} switches them off for one-shot maintenance runs of the
 * jar (the local test-data purge), which must not run the developer API's jobs a second time.
 */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@Profile("local")
@ConditionalOnProperty(
        name = "orenji.scheduling.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class SchedulingConfig {}
