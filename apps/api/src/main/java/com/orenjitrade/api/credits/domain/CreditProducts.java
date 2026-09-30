package com.orenjitrade.api.credits.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.billing.domain.Entitlements;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.cache.RedisJsonCache;
import com.orenjitrade.api.credits.domain.CreditRows.CreditProduct;
import com.orenjitrade.api.credits.infra.CreditProductRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Credit products (ADR 0014: what credits unlock and their prices are data): cached in Redis for
 * {@link #CACHE_TTL} and evicted after every admin change ({@code SUPER_ADMIN}, audited {@code
 * credits.product.update}). The entitlement key of a product is fixed; its value is validated like
 * an admin entitlement grant.
 */
@Service
public class CreditProducts {

    public static final Duration CACHE_TTL = Duration.ofSeconds(60);
    public static final String ACTION_UPDATE = "credits.product.update";
    public static final String TARGET_PRODUCT = "CREDIT_PRODUCT";

    static final String CACHE_KEY = "credit-products:v1";

    private final CreditProductRepository repository;
    private final RedisJsonCache cache;
    private final Entitlements entitlements;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public CreditProducts(
            CreditProductRepository repository,
            RedisJsonCache cache,
            Entitlements entitlements,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.cache = cache;
        this.entitlements = entitlements;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    /** Every product (active or not), by display order. */
    public List<CreditProduct> all() {
        return cache.get(
                        CACHE_KEY,
                        ProductSnapshot.class,
                        CACHE_TTL,
                        () -> new ProductSnapshot(repository.all()))
                .products();
    }

    public List<CreditProduct> active() {
        return all().stream().filter(CreditProduct::active).toList();
    }

    public Optional<CreditProduct> find(String key) {
        return all().stream().filter(product -> product.key().equals(key)).findFirst();
    }

    /**
     * Editable attributes of a product.
     *
     * @param name display name
     * @param description display text
     * @param featureValue entitlement value
     * @param cost price in credits (1-100000)
     * @param durationHours validity (1-720 hours)
     * @param active whether members can spend on it
     * @param sortOrder display order
     */
    public record ProductUpdate(
            String name,
            @Nullable String description,
            @Nullable String featureValue,
            int cost,
            int durationHours,
            boolean active,
            int sortOrder) {}

    /** Changes a product ({@code SUPER_ADMIN}; 404 for unknown keys). */
    @Transactional
    public CreditProduct update(AuthenticatedUser actor, String key, ProductUpdate update) {
        if (!actor.hasRole(Role.SUPER_ADMIN)) {
            throw ApiException.forbidden("Only a SUPER_ADMIN can change credit products");
        }
        CreditProduct current =
                repository
                        .lock(key)
                        .orElseThrow(() -> ApiException.notFound("Credit product not found"));
        @Nullable String value =
                entitlements.normaliseOverride(current.featureKey(), update.featureValue());
        Instant now = timeProvider.now();
        repository.update(
                key,
                update.name().trim(),
                update.description() == null ? "" : update.description().trim(),
                value,
                update.cost(),
                update.durationHours(),
                update.active(),
                update.sortOrder(),
                actor.userId(),
                now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("previousCost", current.cost());
        details.put("cost", update.cost());
        details.put("previousDurationHours", current.durationHours());
        details.put("durationHours", update.durationHours());
        details.put("previousActive", current.active());
        details.put("active", update.active());
        details.put("value", value == null ? "default" : value);
        auditService.record(
                ActorType.ADMIN, actor.userId(), ACTION_UPDATE, TARGET_PRODUCT, key, details);
        evictAfterCommit();
        return repository.lock(key).orElseThrow();
    }

    /** Drops the cached products (admin writes, tests). */
    public void invalidate() {
        cache.evict(CACHE_KEY);
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

    /** Cache envelope. */
    public record ProductSnapshot(List<CreditProduct> products) {}
}
