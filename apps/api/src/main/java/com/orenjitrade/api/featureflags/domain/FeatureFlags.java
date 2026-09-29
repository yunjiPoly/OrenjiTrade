package com.orenjitrade.api.featureflags.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.cache.RedisJsonCache;
import com.orenjitrade.api.featureflags.infra.FeatureFlagRepository;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.zip.CRC32;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * The feature flags module's service interface ({@code FeatureFlags.isEnabled("mlScanning")}, ADR
 * 0014). The whole {@code feature_flag} table is cached in Redis for {@link #CACHE_TTL} and evicted
 * after every admin write, so changes reach every instance at once.
 *
 * <p>Rollout: an enabled flag with {@code rolloutPercent < 100} applies to the accounts whose
 * deterministic bucket ({@code CRC32(key + ":" + userId) mod 100}) is below the percentage;
 * anonymous callers only see flags rolled out to everybody. Unknown keys are disabled.
 */
@Service
public class FeatureFlags {

    public static final Duration CACHE_TTL = Duration.ofSeconds(60);
    public static final String ACTION_UPDATE = "feature_flag.update";
    public static final String TARGET_FEATURE_FLAG = "FEATURE_FLAG";

    static final String CACHE_KEY = "feature-flags:v1";

    private static final Logger log = LoggerFactory.getLogger(FeatureFlags.class);

    private final FeatureFlagRepository repository;
    private final RedisJsonCache cache;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public FeatureFlags(
            FeatureFlagRepository repository,
            RedisJsonCache cache,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.cache = cache;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    // ---------------------------------------------------------------------------------------
    // Evaluation
    // ---------------------------------------------------------------------------------------

    /** Whether {@code key} is enabled for everybody (anonymous evaluation). */
    public boolean isEnabled(String key) {
        return find(key).map(FeatureFlagView::enabledForEveryone).orElse(false);
    }

    /** Whether {@code key} is enabled for the given account (honours the rollout percentage). */
    public boolean isEnabled(String key, @Nullable UUID userId) {
        return find(key).map(flag -> isEnabled(flag, userId)).orElse(false);
    }

    /**
     * Guards a feature-flagged capability: {@code 404 FEATURE_DISABLED} (extension {@code feature})
     * when the flag is off for the caller.
     */
    public void require(String key, @Nullable UUID userId) {
        if (!isEnabled(key, userId)) {
            throw disabled(key);
        }
    }

    /** The exception thrown by {@link #require}: 404 with {@code errorCode=FEATURE_DISABLED}. */
    public static ApiException disabled(String key) {
        return new ApiException(ErrorCode.FEATURE_DISABLED, "This feature is not available")
                .withProperty("feature", key);
    }

    /** Every flag evaluated for the caller (anonymous when {@code userId} is null), by key. */
    public Map<String, Boolean> evaluateAll(@Nullable UUID userId) {
        Map<String, Boolean> result = new LinkedHashMap<>();
        for (FeatureFlagView flag : all()) {
            result.put(flag.key(), isEnabled(flag, userId));
        }
        return result;
    }

    /** Every flag as stored (admin view), ordered by key. */
    public List<FeatureFlagView> all() {
        return cache.get(
                        CACHE_KEY,
                        FlagSnapshot.class,
                        CACHE_TTL,
                        () -> new FlagSnapshot(repository.findAll()))
                .flags();
    }

    // ---------------------------------------------------------------------------------------
    // Administration
    // ---------------------------------------------------------------------------------------

    /**
     * Changes a flag ({@code SUPER_ADMIN} only; {@code 404} for unknown keys). Audited with the
     * previous and new values; the cache is evicted after commit.
     */
    @Transactional
    public FeatureFlagView update(
            AuthenticatedUser actor,
            String key,
            boolean enabled,
            @Nullable Integer rolloutPercent,
            @Nullable String description) {
        if (!actor.hasRole(Role.SUPER_ADMIN)) {
            throw ApiException.forbidden("Only a SUPER_ADMIN can change feature flags");
        }
        FeatureFlagView current =
                repository
                        .findForUpdate(key)
                        .orElseThrow(() -> ApiException.notFound("Feature flag not found"));
        int rollout = rolloutPercent != null ? rolloutPercent : current.rolloutPercent();
        String text = description != null ? description.trim() : current.description();
        Instant now = timeProvider.now();
        repository.update(key, enabled, rollout, text, actor.userId(), now);

        Map<String, Object> details = new LinkedHashMap<>();
        details.put("previousEnabled", current.enabled());
        details.put("enabled", enabled);
        details.put("previousRolloutPercent", current.rolloutPercent());
        details.put("rolloutPercent", rollout);
        auditService.record(
                ActorType.ADMIN, actor.userId(), ACTION_UPDATE, TARGET_FEATURE_FLAG, key, details);
        evictAfterCommit();
        log.info("Feature flag {} set to enabled={} rollout={}", key, enabled, rollout);
        return new FeatureFlagView(key, enabled, rollout, text, actor.userId(), now);
    }

    /** Drops the cached flags (admin writes, seed, tests). */
    public void invalidate() {
        cache.evict(CACHE_KEY);
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private Optional<FeatureFlagView> find(String key) {
        return all().stream().filter(flag -> flag.key().equals(key)).findFirst();
    }

    private static boolean isEnabled(FeatureFlagView flag, @Nullable UUID userId) {
        if (!flag.enabled()) {
            return false;
        }
        if (flag.rolloutPercent() >= 100) {
            return true;
        }
        return userId != null && bucket(flag.key(), userId) < flag.rolloutPercent();
    }

    /** Deterministic 0-99 bucket of an account for a flag (stable across instances). */
    static int bucket(String key, UUID userId) {
        CRC32 crc = new CRC32();
        crc.update((key + ":" + userId).getBytes(StandardCharsets.UTF_8));
        return (int) (crc.getValue() % 100);
    }

    private void evictAfterCommit() {
        invalidate();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            invalidate();
                        }
                    });
        }
    }

    /** Cache envelope (Redis values must be concrete types). */
    public record FlagSnapshot(List<FeatureFlagView> flags) {}
}
