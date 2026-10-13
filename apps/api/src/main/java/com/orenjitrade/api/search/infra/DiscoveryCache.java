package com.orenjitrade.api.search.infra;

import com.orenjitrade.api.common.cache.RedisJsonCache;
import com.orenjitrade.api.search.domain.DiscoveryCriteria;
import com.orenjitrade.api.search.domain.DiscoveryPage;
import com.orenjitrade.api.search.domain.SearchProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.function.Supplier;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Redis cache of discovery results (60 s per region / filter key) and of anonymous binder counts of
 * the map. Keys are {@code orenji:cache:discovery:<generation>:<sha256 of the request>}.
 * Invalidation bumps the generation counter ({@link #invalidate()}), which orphans every cached
 * entry at once (they expire with their TTL); the TTL bounds staleness for changes without an
 * event. Fails open like {@link RedisJsonCache}.
 */
@Component
public class DiscoveryCache {

    static final String GENERATION_KEY = "orenji:search:discovery:generation";

    private static final Logger log = LoggerFactory.getLogger(DiscoveryCache.class);

    private final RedisJsonCache cache;
    private final StringRedisTemplate redis;
    private final SearchProperties properties;

    public DiscoveryCache(
            RedisJsonCache cache, StringRedisTemplate redis, SearchProperties properties) {
        this.cache = cache;
        this.redis = redis;
        this.properties = properties;
    }

    /** The cached page of {@code criteria}, or the loader's result (then cached). */
    public DiscoveryPage get(DiscoveryCriteria criteria, Supplier<DiscoveryPage> loader) {
        if (disabled()) {
            return loader.get();
        }
        String key = "discovery:" + generation() + ":" + sha256(criteria.cacheKey());
        return cache.get(key, DiscoveryPage.class, properties.discoveryCacheTtl(), loader);
    }

    /**
     * A cached value of {@code type} under {@code name} (already free of viewer data), or the
     * loader's result (then cached); same generation and TTL as the discovery pages.
     */
    public <T> T get(String name, Class<T> type, Supplier<T> loader) {
        if (disabled()) {
            return loader.get();
        }
        String key = "discovery:" + generation() + ":" + sha256(name);
        return cache.get(key, type, properties.discoveryCacheTtl(), loader);
    }

    private boolean disabled() {
        return properties.discoveryCacheTtl().isZero()
                || properties.discoveryCacheTtl().isNegative();
    }

    /** Makes every cached page obsolete (an inventory, location, region or privacy change). */
    public void invalidate() {
        try {
            redis.opsForValue().increment(GENERATION_KEY);
        } catch (DataAccessException e) {
            log.warn("Discovery cache not invalidated (TTL applies): {}", e.getMessage());
        }
    }

    private String generation() {
        try {
            @Nullable String value = redis.opsForValue().get(GENERATION_KEY);
            return value == null ? "0" : value;
        } catch (DataAccessException e) {
            log.warn("Discovery cache generation unavailable: {}", e.getMessage());
            return "0";
        }
    }

    static String sha256(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
