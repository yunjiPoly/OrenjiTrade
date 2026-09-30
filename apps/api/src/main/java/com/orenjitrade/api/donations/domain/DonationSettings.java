package com.orenjitrade.api.donations.domain;

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
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.json.JsonMapper;

/**
 * The {@code donations.*} platform settings (ADR 0014): accepted amounts and currencies. Cached for
 * {@link #CACHE_TTL}; changed by a SUPER_ADMIN through {@code PUT /admin/donations/settings}
 * (audited {@code donations.settings.update}).
 */
@Service
public class DonationSettings {

    public static final Duration CACHE_TTL = Duration.ofSeconds(60);
    public static final String ACTION_UPDATE = "donations.settings.update";
    public static final String TARGET_SETTINGS = "PLATFORM_SETTINGS";

    static final String PREFIX = "donations";
    static final String MIN_AMOUNT = "donations.min_amount";
    static final String MAX_AMOUNT = "donations.max_amount";
    static final String CURRENCIES = "donations.currencies";
    static final String CACHE_KEY = "donation-settings:v1";
    static final Pattern CURRENCY = Pattern.compile("^[A-Z]{3}$");

    private final PlatformSettingsStore store;
    private final RedisJsonCache cache;
    private final AuditService auditService;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public DonationSettings(
            PlatformSettingsStore store,
            RedisJsonCache cache,
            AuditService auditService,
            TimeProvider timeProvider,
            JsonMapper jsonMapper) {
        this.store = store;
        this.cache = cache;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
    }

    /**
     * Current values.
     *
     * @param minAmount smallest accepted donation
     * @param maxAmount largest accepted donation
     * @param currencies accepted currencies
     * @param updatedBy last admin editor
     * @param updatedAt last change
     */
    public record Values(
            BigDecimal minAmount,
            BigDecimal maxAmount,
            List<String> currencies,
            @Nullable UUID updatedBy,
            @Nullable Instant updatedAt) {}

    /**
     * A partial change (absent values are kept).
     *
     * @param minAmount new minimum (0.50-1000.00)
     * @param maxAmount new maximum (1.00-10000.00, at least the minimum)
     * @param currencies new currencies (ISO 4217 codes)
     */
    public record Update(
            @Nullable BigDecimal minAmount,
            @Nullable BigDecimal maxAmount,
            @Nullable List<String> currencies) {}

    public Values current() {
        return cache.get(CACHE_KEY, Values.class, CACHE_TTL, this::load);
    }

    /** Changes values ({@code SUPER_ADMIN}); 400 outside the bounds. */
    @Transactional
    public Values update(AuthenticatedUser actor, Update update) {
        if (!actor.hasRole(Role.SUPER_ADMIN)) {
            throw ApiException.forbidden("Only a SUPER_ADMIN can change donation settings");
        }
        store.lock(PREFIX);
        Values before = load();
        BigDecimal min =
                scaled(update.minAmount() != null ? update.minAmount() : before.minAmount());
        BigDecimal max =
                scaled(update.maxAmount() != null ? update.maxAmount() : before.maxAmount());
        List<String> currencies =
                update.currencies() != null
                        ? update.currencies().stream()
                                .map(code -> code.trim().toUpperCase(Locale.ROOT))
                                .distinct()
                                .toList()
                        : before.currencies();
        List<ProblemFieldError> errors = new ArrayList<>();
        if (min.compareTo(new BigDecimal("0.50")) < 0
                || min.compareTo(new BigDecimal("1000")) > 0) {
            errors.add(new ProblemFieldError("minAmount", "must be between 0.50 and 1000.00"));
        }
        if (max.compareTo(BigDecimal.ONE) < 0
                || max.compareTo(new BigDecimal("10000")) > 0
                || max.compareTo(min) < 0) {
            errors.add(
                    new ProblemFieldError(
                            "maxAmount", "must be between 1.00 and 10000.00 and >= minAmount"));
        }
        if (currencies.isEmpty()
                || currencies.size() > 10
                || currencies.stream().anyMatch(code -> !CURRENCY.matcher(code).matches())) {
            errors.add(new ProblemFieldError("currencies", "1 to 10 ISO 4217 codes"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        Instant now = timeProvider.now();
        Map<String, Object> details = new LinkedHashMap<>();
        if (min.compareTo(before.minAmount()) != 0) {
            store.write(MIN_AMOUNT, min.toPlainString(), actor.userId(), now);
            details.put(MIN_AMOUNT, min.toPlainString());
        }
        if (max.compareTo(before.maxAmount()) != 0) {
            store.write(MAX_AMOUNT, max.toPlainString(), actor.userId(), now);
            details.put(MAX_AMOUNT, max.toPlainString());
        }
        if (!currencies.equals(before.currencies())) {
            store.write(
                    CURRENCIES,
                    jsonMapper.writeValueAsString(String.join(",", currencies)),
                    actor.userId(),
                    now);
            details.put(CURRENCIES, String.join(",", currencies));
        }
        auditService.record(
                ActorType.ADMIN, actor.userId(), ACTION_UPDATE, TARGET_SETTINGS, PREFIX, details);
        evictAfterCommit();
        return load();
    }

    /** Drops the cached values (admin writes, tests). */
    public void invalidate() {
        cache.evict(CACHE_KEY);
    }

    private Values load() {
        Map<String, Setting> rows = store.read(PREFIX);
        Setting latest =
                rows.values().stream().max(Comparator.comparing(Setting::updatedAt)).orElse(null);
        return new Values(
                amount(rows, MIN_AMOUNT, new BigDecimal("2.00")),
                amount(rows, MAX_AMOUNT, new BigDecimal("500.00")),
                currencies(rows),
                latest == null ? null : latest.updatedBy(),
                latest == null ? null : latest.updatedAt());
    }

    private static BigDecimal amount(Map<String, Setting> rows, String key, BigDecimal fallback) {
        Setting setting = rows.get(key);
        if (setting == null) {
            return fallback;
        }
        try {
            return scaled(new BigDecimal(setting.json().trim()));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private List<String> currencies(Map<String, Setting> rows) {
        Setting setting = rows.get(CURRENCIES);
        if (setting == null) {
            return List.of("CAD");
        }
        try {
            String text = jsonMapper.readTree(setting.json()).asString("");
            List<String> codes =
                    Arrays.stream(text.split(","))
                            .map(code -> code.trim().toUpperCase(Locale.ROOT))
                            .filter(code -> CURRENCY.matcher(code).matches())
                            .toList();
            return codes.isEmpty() ? List.of("CAD") : codes;
        } catch (RuntimeException e) {
            return List.of("CAD");
        }
    }

    private static BigDecimal scaled(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
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
