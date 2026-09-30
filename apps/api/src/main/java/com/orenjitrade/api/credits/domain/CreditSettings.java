package com.orenjitrade.api.credits.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.cache.RedisJsonCache;
import com.orenjitrade.api.common.settings.PlatformSettingsStore;
import com.orenjitrade.api.common.settings.PlatformSettingsStore.Setting;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * The {@code credits.*} platform settings (ADR 0014): referral rewards and limits. Cached for
 * {@link #CACHE_TTL}; changed by a SUPER_ADMIN through {@code PUT /admin/credits/settings} (audited
 * {@code credits.settings.update}).
 */
@Service
public class CreditSettings {

    public static final Duration CACHE_TTL = Duration.ofSeconds(60);
    public static final String ACTION_UPDATE = "credits.settings.update";
    public static final String TARGET_SETTINGS = "PLATFORM_SETTINGS";

    static final String PREFIX = "credits";
    static final String REFERRER_REWARD = "credits.referral_referrer_reward";
    static final String REFEREE_REWARD = "credits.referral_referee_reward";
    static final String MAX_ACCOUNT_AGE_DAYS = "credits.referral_max_account_age_days";
    static final String MAX_PER_REFERRER = "credits.referral_max_per_referrer";
    static final String CACHE_KEY = "credit-settings:v1";

    private final PlatformSettingsStore store;
    private final RedisJsonCache cache;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public CreditSettings(
            PlatformSettingsStore store,
            RedisJsonCache cache,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.store = store;
        this.cache = cache;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    /**
     * Current values.
     *
     * @param referrerReward credits for the code owner per redemption (0-10000)
     * @param refereeReward credits for the redeeming account (0-10000)
     * @param maxAccountAgeDays redemption window after the redeeming account's creation (1-365)
     * @param maxPerReferrer redemptions of one code (1-10000)
     * @param updatedBy last admin editor
     * @param updatedAt last change
     */
    public record Values(
            int referrerReward,
            int refereeReward,
            int maxAccountAgeDays,
            int maxPerReferrer,
            @Nullable UUID updatedBy,
            @Nullable Instant updatedAt) {}

    /**
     * A partial change (absent values are kept).
     *
     * @param referrerReward new referrer reward
     * @param refereeReward new referee reward
     * @param maxAccountAgeDays new redemption window
     * @param maxPerReferrer new redemption cap
     */
    public record Update(
            @Nullable Integer referrerReward,
            @Nullable Integer refereeReward,
            @Nullable Integer maxAccountAgeDays,
            @Nullable Integer maxPerReferrer) {}

    public Values current() {
        return cache.get(CACHE_KEY, Values.class, CACHE_TTL, this::load);
    }

    /** Changes values ({@code SUPER_ADMIN}); 400 outside the bounds. */
    @Transactional
    public Values update(AuthenticatedUser actor, Update update) {
        if (!actor.hasRole(Role.SUPER_ADMIN)) {
            throw ApiException.forbidden("Only a SUPER_ADMIN can change credit settings");
        }
        List<ProblemFieldError> errors = new ArrayList<>();
        check(errors, "referrerReward", update.referrerReward(), 0, 10_000);
        check(errors, "refereeReward", update.refereeReward(), 0, 10_000);
        check(errors, "maxAccountAgeDays", update.maxAccountAgeDays(), 1, 365);
        check(errors, "maxPerReferrer", update.maxPerReferrer(), 1, 10_000);
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        store.lock(PREFIX);
        Values before = load();
        Instant now = timeProvider.now();
        Map<String, Object> details = new LinkedHashMap<>();
        write(
                REFERRER_REWARD,
                update.referrerReward(),
                before.referrerReward(),
                actor,
                now,
                details);
        write(REFEREE_REWARD, update.refereeReward(), before.refereeReward(), actor, now, details);
        write(
                MAX_ACCOUNT_AGE_DAYS,
                update.maxAccountAgeDays(),
                before.maxAccountAgeDays(),
                actor,
                now,
                details);
        write(
                MAX_PER_REFERRER,
                update.maxPerReferrer(),
                before.maxPerReferrer(),
                actor,
                now,
                details);
        auditService.record(
                ActorType.ADMIN, actor.userId(), ACTION_UPDATE, TARGET_SETTINGS, PREFIX, details);
        evictAfterCommit();
        return load();
    }

    /** Drops the cached values (admin writes, tests). */
    public void invalidate() {
        cache.evict(CACHE_KEY);
    }

    private void write(
            String key,
            @Nullable Integer value,
            int previous,
            AuthenticatedUser actor,
            Instant now,
            Map<String, Object> details) {
        if (value == null || value == previous) {
            return;
        }
        store.write(key, Integer.toString(value), actor.userId(), now);
        details.put(key, Map.of("previous", previous, "value", value));
    }

    private Values load() {
        Map<String, Setting> rows = store.read(PREFIX);
        Setting latest =
                rows.values().stream().max(Comparator.comparing(Setting::updatedAt)).orElse(null);
        return new Values(
                number(rows, REFERRER_REWARD, 100),
                number(rows, REFEREE_REWARD, 50),
                number(rows, MAX_ACCOUNT_AGE_DAYS, 30),
                number(rows, MAX_PER_REFERRER, 50),
                latest == null ? null : latest.updatedBy(),
                latest == null ? null : latest.updatedAt());
    }

    private static int number(Map<String, Setting> rows, String key, int fallback) {
        Setting setting = rows.get(key);
        if (setting == null) {
            return fallback;
        }
        try {
            return Integer.parseInt(setting.json().trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static void check(
            List<ProblemFieldError> errors,
            String field,
            @Nullable Integer value,
            int min,
            int max) {
        if (value != null && (value < min || value > max)) {
            errors.add(new ProblemFieldError(field, "must be between " + min + " and " + max));
        }
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
}
