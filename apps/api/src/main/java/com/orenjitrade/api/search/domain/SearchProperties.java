package com.orenjitrade.api.search.domain;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.search.*}: technical defaults of discovery and search.
 *
 * @param discoveryCacheTtl lifetime of cached discovery results and anonymous binder counts
 * @param matchingItemsPerCollector matching items listed per collector marker
 */
@ConfigurationProperties(prefix = "orenji.search")
public record SearchProperties(
        @DefaultValue("60s") Duration discoveryCacheTtl,
        @DefaultValue("5") int matchingItemsPerCollector) {}
