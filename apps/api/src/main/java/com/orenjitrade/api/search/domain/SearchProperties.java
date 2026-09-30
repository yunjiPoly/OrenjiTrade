package com.orenjitrade.api.search.domain;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.search.*}: technical defaults of map discovery and search. The plan-dependent
 * maximum radius is a business rule and lives in {@code usage_limit} ({@code map.radius.max_km},
 * ADR 0014), never here.
 *
 * @param defaultRadiusKm radius used when a request gives none (then capped by the plan)
 * @param nearbyCacheTtl lifetime of cached nearby results (Phase 4 contract: 60 s)
 * @param matchingItemsPerCollector matching items listed per collector marker
 */
@ConfigurationProperties(prefix = "orenji.search")
public record SearchProperties(
        @DefaultValue("10") double defaultRadiusKm,
        @DefaultValue("60s") Duration nearbyCacheTtl,
        @DefaultValue("5") int matchingItemsPerCollector) {}
