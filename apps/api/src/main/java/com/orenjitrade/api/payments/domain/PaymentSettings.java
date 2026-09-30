package com.orenjitrade.api.payments.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.cache.RedisJsonCache;
import com.orenjitrade.api.payments.infra.PlatformSettingsRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * The {@code payments.*} rows of {@code platform_settings} (Phase 9 contract, ADR 0014): dispute
 * window, platform fee, auto-release switch, reminder lead time and the admin refund policy. Read
 * through a 60 s Redis cache (fail-open), evicted after every admin write; invalid or missing
 * values fall back to the documented defaults (logged). Changed only by a SUPER_ADMIN through
 * {@code PUT /admin/payments/settings}, audited.
 */
@Service
public class PaymentSettings {

    public static final String PREFIX = "payments.";
    public static final String DISPUTE_WINDOW_DAYS = "payments.dispute_window_days";
    public static final String PLATFORM_FEE_PERCENT = "payments.platform_fee_percent";
    public static final String AUTO_RELEASE_ENABLED = "payments.auto_release_enabled";
    public static final String RELEASE_REMINDER_HOURS = "payments.release_reminder_hours";
    public static final String ADMIN_REFUNDS_ENABLED = "payments.admin_refunds_enabled";

    public static final String ACTION_UPDATE = "payments.settings.update";
    public static final String TARGET = "PLATFORM_SETTINGS";

    static final Duration CACHE_TTL = Duration.ofSeconds(60);
    static final String CACHE_KEY = "payment-settings:v1";

    /** Fallbacks (the V080 defaults) when a row is missing or unreadable. */
    static final Settings DEFAULTS = new Settings(7, new BigDecimal("5.00"), true, 48, false);

    private static final Logger log = LoggerFactory.getLogger(PaymentSettings.class);

    private final PlatformSettingsRepository repository;
    private final RedisJsonCache cache;
    private final AuditService audit;
    private final TimeProvider timeProvider;

    public PaymentSettings(
            PlatformSettingsRepository repository,
            RedisJsonCache cache,
            AuditService audit,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.cache = cache;
        this.audit = audit;
        this.timeProvider = timeProvider;
    }

    /**
     * The payment rules.
     *
     * @param disputeWindowDays days after shipment during which a dispute can be opened (1-60)
     * @param platformFeePercent fee kept from protected payments (0-30, two decimals)
     * @param autoReleaseEnabled whether the hourly job releases payouts after the window
     * @param releaseReminderHours lead time of the buyer's reminder before the release (1-168)
     * @param adminRefundsEnabled whether ADMIN (not only SUPER_ADMIN) may issue refunds
     */
    public record Settings(
            int disputeWindowDays,
            BigDecimal platformFeePercent,
            boolean autoReleaseEnabled,
            int releaseReminderHours,
            boolean adminRefundsEnabled) {}

    /** The current rules (cached). */
    public Settings current() {
        return cache.get(CACHE_KEY, Settings.class, CACHE_TTL, this::load);
    }

    /**
     * Last change of the rules (admin view): {@code updatedBy} (optional) and {@code updatedAt}.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> lastChange() {
        return repository.lastChange(PREFIX);
    }

    /**
     * {@code PUT /admin/payments/settings}: SUPER_ADMIN only (403 otherwise); absent fields keep
     * their value; out-of-range values answer 400. Audited with the previous and new values.
     */
    @Transactional
    public Settings update(
            AuthenticatedUser actor,
            @Nullable Integer disputeWindowDays,
            @Nullable BigDecimal platformFeePercent,
            @Nullable Boolean autoReleaseEnabled,
            @Nullable Integer releaseReminderHours,
            @Nullable Boolean adminRefundsEnabled) {
        if (!actor.hasRole(Role.SUPER_ADMIN)) {
            throw ApiException.forbidden("Only a SUPER_ADMIN can change the payment settings");
        }
        List<ProblemFieldError> errors = new ArrayList<>();
        if (disputeWindowDays != null && (disputeWindowDays < 1 || disputeWindowDays > 60)) {
            errors.add(new ProblemFieldError("disputeWindowDays", "must be between 1 and 60"));
        }
        if (platformFeePercent != null
                && (platformFeePercent.signum() < 0
                        || platformFeePercent.compareTo(BigDecimal.valueOf(30)) > 0
                        || platformFeePercent.stripTrailingZeros().scale() > 2)) {
            errors.add(
                    new ProblemFieldError(
                            "platformFeePercent", "must be between 0 and 30 with two decimals"));
        }
        if (releaseReminderHours != null
                && (releaseReminderHours < 1 || releaseReminderHours > 168)) {
            errors.add(new ProblemFieldError("releaseReminderHours", "must be between 1 and 168"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        repository.lockPrefix(PREFIX);
        Settings before = load();
        Settings after =
                new Settings(
                        disputeWindowDays != null ? disputeWindowDays : before.disputeWindowDays(),
                        platformFeePercent != null
                                ? platformFeePercent.setScale(2, RoundingMode.HALF_UP)
                                : before.platformFeePercent(),
                        autoReleaseEnabled != null
                                ? autoReleaseEnabled
                                : before.autoReleaseEnabled(),
                        releaseReminderHours != null
                                ? releaseReminderHours
                                : before.releaseReminderHours(),
                        adminRefundsEnabled != null
                                ? adminRefundsEnabled
                                : before.adminRefundsEnabled());
        Instant now = timeProvider.now();
        UUID by = actor.userId();
        repository.put(DISPUTE_WINDOW_DAYS, Integer.toString(after.disputeWindowDays()), by, now);
        repository.put(PLATFORM_FEE_PERCENT, after.platformFeePercent().toPlainString(), by, now);
        repository.put(AUTO_RELEASE_ENABLED, Boolean.toString(after.autoReleaseEnabled()), by, now);
        repository.put(
                RELEASE_REMINDER_HOURS, Integer.toString(after.releaseReminderHours()), by, now);
        repository.put(
                ADMIN_REFUNDS_ENABLED, Boolean.toString(after.adminRefundsEnabled()), by, now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("previous", describe(before));
        details.put("current", describe(after));
        audit.record(ActorType.ADMIN, by, ACTION_UPDATE, TARGET, "payments", details);
        evictAfterCommit();
        log.info("Payment settings changed by {}", by);
        return after;
    }

    /** Drops the cached rules (admin writes, tests). */
    public void invalidate() {
        cache.evict(CACHE_KEY);
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    Settings load() {
        Map<String, String> values = repository.valuesWithPrefix(PREFIX);
        return new Settings(
                integer(values, DISPUTE_WINDOW_DAYS, DEFAULTS.disputeWindowDays(), 1, 60),
                percent(values.get(PLATFORM_FEE_PERCENT)),
                bool(values, AUTO_RELEASE_ENABLED, DEFAULTS.autoReleaseEnabled()),
                integer(values, RELEASE_REMINDER_HOURS, DEFAULTS.releaseReminderHours(), 1, 168),
                bool(values, ADMIN_REFUNDS_ENABLED, DEFAULTS.adminRefundsEnabled()));
    }

    private static int integer(
            Map<String, String> values, String key, int fallback, int min, int max) {
        String raw = unquote(values.get(key));
        try {
            int value = new BigDecimal(raw).intValueExact();
            if (value >= min && value <= max) {
                return value;
            }
        } catch (RuntimeException e) {
            // fall through
        }
        log.warn("Platform setting {} is missing or invalid; using {}", key, fallback);
        return fallback;
    }

    private static BigDecimal percent(@Nullable String raw) {
        try {
            BigDecimal value = new BigDecimal(unquote(raw));
            if (value.signum() >= 0 && value.compareTo(BigDecimal.valueOf(100)) <= 0) {
                return value.setScale(2, RoundingMode.HALF_UP);
            }
        } catch (RuntimeException e) {
            // fall through
        }
        log.warn(
                "Platform setting {} is missing or invalid; using the default",
                PLATFORM_FEE_PERCENT);
        return DEFAULTS.platformFeePercent();
    }

    private static boolean bool(Map<String, String> values, String key, boolean fallback) {
        String raw = unquote(values.get(key));
        if ("true".equals(raw) || "false".equals(raw)) {
            return Boolean.parseBoolean(raw);
        }
        log.warn("Platform setting {} is missing or invalid; using {}", key, fallback);
        return fallback;
    }

    private static String unquote(@Nullable String raw) {
        if (raw == null) {
            return "";
        }
        String trimmed = raw.trim();
        if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
            return trimmed.substring(1, trimmed.length() - 1).trim();
        }
        return trimmed;
    }

    private static Map<String, Object> describe(Settings settings) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("disputeWindowDays", settings.disputeWindowDays());
        values.put("platformFeePercent", settings.platformFeePercent());
        values.put("autoReleaseEnabled", settings.autoReleaseEnabled());
        values.put("releaseReminderHours", settings.releaseReminderHours());
        values.put("adminRefundsEnabled", settings.adminRefundsEnabled());
        return values;
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
