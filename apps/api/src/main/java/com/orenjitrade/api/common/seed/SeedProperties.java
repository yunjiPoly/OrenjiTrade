package com.orenjitrade.api.common.seed;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.seed.*}.
 *
 * @param enabled whether {@link SeedDataRunner} runs at startup ({@code local} and {@code dev})
 * @param emulatorPassword password of every seeded Firebase emulator user (never a real secret; see
 *     docs/development/test-accounts.md)
 */
@ConfigurationProperties(prefix = "orenji.seed")
public record SeedProperties(
        @DefaultValue("false") boolean enabled,
        @DefaultValue("LocalDev!2026") String emulatorPassword) {}
