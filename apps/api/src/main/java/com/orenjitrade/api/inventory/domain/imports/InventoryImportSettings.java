package com.orenjitrade.api.inventory.domain.imports;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
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
 * The {@code inventory.import.*} platform settings (ADR 0014, seeded by V113): how large an import
 * file may be and how long a preview is kept. Cached for {@link #CACHE_TTL}; changed by an ADMIN
 * through {@code PUT /api/v1/admin/inventory/import-settings} (audited {@code
 * inventory.import.settings.update}). The server applies them to every upload, whatever the client
 * checked before.
 *
 * <p>The defaults: a YDK deck file of at most 100 kB and 500 lines (owner spec 2026-10-08); a
 * Collectr CSV export of at most 2 MB and 5 000 rows. A row of such an export is about 200 bytes,
 * so 5 000 rows is about 1 MB and the size limit leaves room for long names and notes; 5 000 rows
 * is ten chunks of 500 items at the commit, which a request finishes in seconds. A larger
 * collection is exported in parts, or an admin raises the limit (up to 20 000 rows and 8 MB, below
 * the 10 MB the server accepts for any upload).
 */
@Service
public class InventoryImportSettings {

    public static final Duration CACHE_TTL = Duration.ofSeconds(60);
    public static final String ACTION_UPDATE = "inventory.import.settings.update";
    public static final String TARGET_SETTINGS = "PLATFORM_SETTINGS";

    static final String PREFIX = "inventory.import";
    static final String YDK_MAX_KB = "inventory.import.ydk_max_kb";
    static final String YDK_MAX_LINES = "inventory.import.ydk_max_lines";
    static final String CSV_MAX_KB = "inventory.import.csv_max_kb";
    static final String CSV_MAX_ROWS = "inventory.import.csv_max_rows";
    static final String PREVIEW_TTL_MINUTES = "inventory.import.preview_ttl_minutes";
    static final String CACHE_KEY = "inventory-import-settings:v1";

    /** The V113 seed, also the fallback when a row is missing or unreadable. */
    public static final Values DEFAULTS = new Values(100, 500, 2048, 5000, 60, null, null);

    private static final Map<String, int[]> BOUNDS = bounds();

    private static Map<String, int[]> bounds() {
        Map<String, int[]> bounds = new LinkedHashMap<>();
        bounds.put(YDK_MAX_KB, new int[] {1, 1024});
        bounds.put(YDK_MAX_LINES, new int[] {10, 5000});
        bounds.put(CSV_MAX_KB, new int[] {16, 8192});
        bounds.put(CSV_MAX_ROWS, new int[] {10, 20_000});
        bounds.put(PREVIEW_TTL_MINUTES, new int[] {5, 1440});
        return bounds;
    }

    private final PlatformSettingsStore store;
    private final RedisJsonCache cache;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public InventoryImportSettings(
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
     * @param ydkMaxKb largest YDK file, in kB of 1 024 bytes
     * @param ydkMaxLines most lines of a YDK file
     * @param csvMaxKb largest CSV file, in kB of 1 024 bytes
     * @param csvMaxRows most rows of a CSV file (the header not counted)
     * @param previewTtlMinutes minutes a preview is kept, and its result after the commit
     * @param updatedBy last admin editor ({@code null} for the migration default)
     * @param updatedAt last change
     */
    public record Values(
            int ydkMaxKb,
            int ydkMaxLines,
            int csvMaxKb,
            int csvMaxRows,
            int previewTtlMinutes,
            @Nullable UUID updatedBy,
            @Nullable Instant updatedAt) {

        /** Largest file of a source, in bytes. */
        public int maxBytes(ImportSource source) {
            return (source == ImportSource.YDK ? ydkMaxKb : csvMaxKb) * 1024;
        }

        public YdkParser.Limits ydkLimits() {
            return new YdkParser.Limits(ydkMaxKb * 1024, ydkMaxLines);
        }

        public CollectrCsvParser.Limits csvLimits() {
            return new CollectrCsvParser.Limits(csvMaxKb * 1024, csvMaxRows);
        }

        public Duration previewTtl() {
            return Duration.ofMinutes(previewTtlMinutes);
        }
    }

    /**
     * A partial change (absent values are kept).
     *
     * @param ydkMaxKb 1-1024
     * @param ydkMaxLines 10-5000
     * @param csvMaxKb 16-8192
     * @param csvMaxRows 10-20000
     * @param previewTtlMinutes 5-1440
     */
    public record Update(
            @Nullable Integer ydkMaxKb,
            @Nullable Integer ydkMaxLines,
            @Nullable Integer csvMaxKb,
            @Nullable Integer csvMaxRows,
            @Nullable Integer previewTtlMinutes) {}

    public Values current() {
        return cache.get(CACHE_KEY, Values.class, CACHE_TTL, this::load);
    }

    /** Changes values (ADMIN, audited); 400 outside the bounds. */
    @Transactional
    public Values update(AuthenticatedUser actor, Update update) {
        Map<String, Integer> wanted = new LinkedHashMap<>();
        put(wanted, YDK_MAX_KB, update.ydkMaxKb());
        put(wanted, YDK_MAX_LINES, update.ydkMaxLines());
        put(wanted, CSV_MAX_KB, update.csvMaxKb());
        put(wanted, CSV_MAX_ROWS, update.csvMaxRows());
        put(wanted, PREVIEW_TTL_MINUTES, update.previewTtlMinutes());
        List<ProblemFieldError> errors = new ArrayList<>();
        wanted.forEach(
                (key, value) -> {
                    int[] bound = BOUNDS.get(key);
                    if (value < bound[0] || value > bound[1]) {
                        errors.add(
                                new ProblemFieldError(
                                        field(key),
                                        "must be between " + bound[0] + " and " + bound[1]));
                    }
                });
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        store.lock(PREFIX);
        Map<String, Integer> before = numbers(store.read(PREFIX));
        Instant now = timeProvider.now();
        Map<String, Object> details = new LinkedHashMap<>();
        wanted.forEach(
                (key, value) -> {
                    if (!value.equals(before.get(key))) {
                        store.write(key, Integer.toString(value), actor.userId(), now);
                        details.put(key, value);
                    }
                });
        if (!details.isEmpty()) {
            auditService.record(
                    ActorType.ADMIN,
                    actor.userId(),
                    ACTION_UPDATE,
                    TARGET_SETTINGS,
                    PREFIX,
                    details);
            evictAfterCommit();
        }
        return load();
    }

    /** Drops the cached values (admin writes, tests). */
    public void invalidate() {
        cache.evict(CACHE_KEY);
    }

    private Values load() {
        Map<String, Setting> rows = store.read(PREFIX);
        Map<String, Integer> numbers = numbers(rows);
        @Nullable Setting latest =
                rows.values().stream()
                        .filter(setting -> setting.updatedBy() != null)
                        .max(Comparator.comparing(Setting::updatedAt))
                        .orElse(null);
        return new Values(
                numbers.getOrDefault(YDK_MAX_KB, DEFAULTS.ydkMaxKb()),
                numbers.getOrDefault(YDK_MAX_LINES, DEFAULTS.ydkMaxLines()),
                numbers.getOrDefault(CSV_MAX_KB, DEFAULTS.csvMaxKb()),
                numbers.getOrDefault(CSV_MAX_ROWS, DEFAULTS.csvMaxRows()),
                numbers.getOrDefault(PREVIEW_TTL_MINUTES, DEFAULTS.previewTtlMinutes()),
                latest == null ? null : latest.updatedBy(),
                latest == null ? null : latest.updatedAt());
    }

    /** The stored numbers that are inside their bounds (anything else falls back). */
    private static Map<String, Integer> numbers(Map<String, Setting> rows) {
        Map<String, Integer> numbers = new LinkedHashMap<>();
        BOUNDS.forEach(
                (key, bound) -> {
                    @Nullable Setting setting = rows.get(key);
                    if (setting == null) {
                        return;
                    }
                    try {
                        int value = Integer.parseInt(setting.json().trim());
                        if (value >= bound[0] && value <= bound[1]) {
                            numbers.put(key, value);
                        }
                    } catch (NumberFormatException e) {
                        // An unreadable value: the default applies.
                    }
                });
        return numbers;
    }

    private static void put(Map<String, Integer> wanted, String key, @Nullable Integer value) {
        if (value != null) {
            wanted.put(key, value);
        }
    }

    /** {@code inventory.import.csv_max_rows} as the request names it: {@code csvMaxRows}. */
    private static String field(String key) {
        String name = key.substring(PREFIX.length() + 1);
        StringBuilder field = new StringBuilder();
        boolean upper = false;
        for (char c : name.toCharArray()) {
            if (c == '_') {
                upper = true;
            } else {
                field.append(upper ? Character.toUpperCase(c) : c);
                upper = false;
            }
        }
        return field.toString();
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
