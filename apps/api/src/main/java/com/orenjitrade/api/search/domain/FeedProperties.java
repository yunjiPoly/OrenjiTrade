package com.orenjitrade.api.search.domain;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * {@code orenji.feed.*}: Home's feed ({@code GET /api/v1/feed}, stage R7 of the phone redesign).
 *
 * @param windowDays the feed never returns anything that became public longer ago than this many
 *     days (owner prompt of 2026-10-19, section 5: a server setting, not a phone constant; 1 to
 *     365, 30 by default)
 */
@Validated
@ConfigurationProperties(prefix = "orenji.feed")
public record FeedProperties(
        @DefaultValue("30")
                @jakarta.validation.constraints.Min(1)
                @jakarta.validation.constraints.Max(365)
                int windowDays) {}
