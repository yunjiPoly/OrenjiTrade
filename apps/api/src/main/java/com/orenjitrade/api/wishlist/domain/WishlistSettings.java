package com.orenjitrade.api.wishlist.domain;

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
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.json.JsonMapper;

/**
 * The {@code wishlist.*} platform settings (ADR 0014): the price terms a wish may show ({@code
 * wishlist.price_terms}, comma-separated labels such as {@code "85% TCG"}; seeded by V112 with 80,
 * 85, 90, 100 % TCG and 100 % TCG+). Cached for {@link #CACHE_TTL}; changed by an ADMIN through
 * {@code PUT /api/v1/admin/wishlist/settings} (audited {@code wishlist.settings.update}). Removing
 * a term later leaves the wishes that chose it unchanged (their label still reads correctly); new
 * and edited wishes may only choose a listed term.
 */
@Service
public class WishlistSettings {

    public static final Duration CACHE_TTL = Duration.ofSeconds(60);
    public static final String ACTION_UPDATE = "wishlist.settings.update";
    public static final String TARGET_SETTINGS = "PLATFORM_SETTINGS";
    public static final int MAX_TERMS = 10;

    static final String PREFIX = "wishlist";
    static final String PRICE_TERMS = "wishlist.price_terms";
    static final String CACHE_KEY = "wishlist-settings:v1";

    /** The V112 seed, also the fallback when the row is missing or unreadable. */
    public static final List<String> DEFAULT_PRICE_TERMS =
            List.of("80% TCG", "85% TCG", "90% TCG", "100% TCG", "100% TCG+");

    private final PlatformSettingsStore store;
    private final RedisJsonCache cache;
    private final AuditService auditService;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public WishlistSettings(
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
     * @param priceTerms labels in display order
     * @param updatedBy last admin editor ({@code null} for the migration default)
     * @param updatedAt last change
     */
    public record Values(
            List<String> priceTerms, @Nullable UUID updatedBy, @Nullable Instant updatedAt) {

        /** The parsed terms, in display order. */
        public List<PriceTerm> terms() {
            return priceTerms.stream().map(PriceTerm::parse).flatMap(Optional::stream).toList();
        }

        /** The listed term with this label (exact match after trimming). */
        public Optional<PriceTerm> find(@Nullable String label) {
            if (label == null) {
                return Optional.empty();
            }
            String wanted = label.strip();
            return terms().stream().filter(term -> term.label().equals(wanted)).findFirst();
        }
    }

    public Values current() {
        return cache.get(CACHE_KEY, Values.class, CACHE_TTL, this::load);
    }

    /** Replaces the price terms (ADMIN, audited); 400 for an invalid list. */
    @Transactional
    public Values update(AuthenticatedUser actor, List<String> priceTerms) {
        List<String> terms = validate(priceTerms);
        store.lock(PREFIX);
        Values before = load();
        if (!terms.equals(before.priceTerms())) {
            Instant now = timeProvider.now();
            String joined = String.join(",", terms);
            store.write(PRICE_TERMS, jsonMapper.writeValueAsString(joined), actor.userId(), now);
            Map<String, Object> details = new LinkedHashMap<>();
            details.put(PRICE_TERMS, joined);
            details.put("before", String.join(",", before.priceTerms()));
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

    /**
     * The normalised list (trimmed, duplicates removed, order kept), or 400: 1 to {@value
     * #MAX_TERMS} terms, each {@code "<percent>% TCG"} with an optional {@code +} and a percent of
     * 1-200.
     */
    static List<String> validate(@Nullable List<String> raw) {
        List<ProblemFieldError> errors = new ArrayList<>();
        Set<String> labels = new LinkedHashSet<>();
        if (raw != null) {
            for (String value : raw) {
                Optional<PriceTerm> term = PriceTerm.parse(value);
                if (term.isEmpty()) {
                    errors.add(
                            new ProblemFieldError(
                                    "priceTerms",
                                    "\""
                                            + (value == null ? "" : value.strip())
                                            + "\" is not a term like \"85% TCG\" or \"100% TCG+\""
                                            + " (percent 1-200)"));
                } else {
                    labels.add(term.get().label());
                }
            }
        }
        if (errors.isEmpty() && (labels.isEmpty() || labels.size() > MAX_TERMS)) {
            errors.add(
                    new ProblemFieldError("priceTerms", "between 1 and " + MAX_TERMS + " terms"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        return List.copyOf(labels);
    }

    private Values load() {
        Map<String, Setting> rows = store.read(PREFIX);
        @Nullable Setting setting = rows.get(PRICE_TERMS);
        if (setting == null) {
            return new Values(DEFAULT_PRICE_TERMS, null, null);
        }
        List<String> terms = DEFAULT_PRICE_TERMS;
        try {
            String text = jsonMapper.readTree(setting.json()).asString("");
            List<String> parsed = new ArrayList<>();
            for (String part : text.split(",")) {
                PriceTerm.parse(part).ifPresent(term -> parsed.add(term.label()));
            }
            if (!parsed.isEmpty()) {
                terms = List.copyOf(new LinkedHashSet<>(parsed));
            }
        } catch (RuntimeException e) {
            terms = DEFAULT_PRICE_TERMS;
        }
        return new Values(terms, setting.updatedBy(), setting.updatedAt());
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
