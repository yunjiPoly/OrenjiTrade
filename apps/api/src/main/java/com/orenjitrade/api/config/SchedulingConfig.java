package com.orenjitrade.api.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * {@code @Scheduled} jobs run only under the {@code local} profile, standing in for Cloud
 * Scheduler; deployed environments trigger the same work through {@code POST /internal/jobs/*}.
 */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@Profile("local")
public class SchedulingConfig {}
