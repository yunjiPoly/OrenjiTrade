package com.orenjitrade.api.search.infra;

import com.orenjitrade.api.common.cache.RedisJsonCache;
import com.orenjitrade.api.search.domain.NearbyCriteria;
import com.orenjitrade.api.search.domain.NearbyPage;
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
 * Redis cache of discovery results (Phase 4 contract: "Cached in Redis 60 s per rounded-centre /
 * radius / filter key"). Keys are {@code orenji:cache:nearby:<generation>:<sha256 of the request>}:
 * the snapped centre never appears in a key in clear. Invalidation bumps the generation counter
 * ({@link #invalidate()}), which orphans every cached entry at once (they expire with their TTL);
 * the TTL bounds staleness for changes without an event. Fails open like {@link RedisJsonCache}.
 */
@Component
public class NearbyCache {

    static final String GENERATION_KEY = "orenji:search:nearby:generation";

    private static final Logger log = LoggerFactory.getLogger(NearbyCache.class);

    private final RedisJsonCache cache;
    private final StringRedisTemplate redis;
    private final SearchProperties properties;

    public NearbyCache(
            RedisJsonCache cache, StringRedisTemplate redis, SearchProperties properties) {
        this.cache = cache;
        this.redis = redis;
        this.properties = properties;
    }

    /** The cached page of {@code criteria}, or the loader's result (then cached). */
    public NearbyPage get(NearbyCriteria criteria, Supplier<NearbyPage> loader) {
        if (properties.nearbyCacheTtl().isZero() || properties.nearbyCacheTtl().isNegative()) {
            return loader.get();
        }
        String key = "nearby:" + generation() + ":" + sha256(criteria.cacheKey());
        return cache.get(key, NearbyPage.class, properties.nearbyCacheTtl(), loader);
    }

    /** Makes every cached page obsolete (an inventory, location or privacy change happened). */
    public void invalidate() {
        try {
            redis.opsForValue().increment(GENERATION_KEY);
        } catch (DataAccessException e) {
            log.warn("Nearby cache not invalidated (TTL applies): {}", e.getMessage());
        }
    }

    private String generation() {
        try {
            @Nullable String value = redis.opsForValue().get(GENERATION_KEY);
            return value == null ? "0" : value;
        } catch (DataAccessException e) {
            log.warn("Nearby cache generation unavailable: {}", e.getMessage());
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
