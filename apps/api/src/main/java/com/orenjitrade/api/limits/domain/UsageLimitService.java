package com.orenjitrade.api.limits.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.cache.RedisJsonCache;
import com.orenjitrade.api.limits.infra.UsageLimitRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * The usage limits (ADR 0014): the same caps for every collector since stage F1 (ADR 0019, no
 * plans). Cached reads for {@link Limits} and the audited admin edits ({@code SUPER_ADMIN}). The
 * whole list is cached in Redis for {@link #CACHE_TTL} and evicted after every write.
 */
@Service
public class UsageLimitService {

    public static final Duration CACHE_TTL = Duration.ofSeconds(60);
    public static final String ACTION_LIMIT_UPDATE = "usage_limit.update";
    public static final String TARGET_USAGE_LIMIT = "USAGE_LIMIT";

    static final String CACHE_KEY = "usage-limits:v1";

    private final UsageLimitRepository repository;
    private final RedisJsonCache cache;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public UsageLimitService(
            UsageLimitRepository repository,
            RedisJsonCache cache,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.cache = cache;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    /** Every usage limit, by key. */
    public List<UsageLimitRule> all() {
        return cache.get(
                        CACHE_KEY,
                        RulesSnapshot.class,
                        CACHE_TTL,
                        () -> new RulesSnapshot(repository.findAll()))
                .limits();
    }

    /** The limit of {@code key}, if it exists. */
    public Optional<UsageLimitRule> find(String key) {
        return all().stream().filter(limit -> limit.key().equals(key)).findFirst();
    }

    /** Changes one usage limit (value, window of counters, description) for everyone. */
    @Transactional
    public UsageLimitRule updateLimit(
            AuthenticatedUser actor,
            UUID limitId,
            @Nullable Integer maxValue,
            @Nullable LimitWindow window,
            @Nullable String description) {
        if (!actor.hasRole(Role.SUPER_ADMIN)) {
            throw ApiException.forbidden("Only a SUPER_ADMIN can change usage limits");
        }
        UsageLimitRule current =
                repository
                        .lock(limitId)
                        .orElseThrow(() -> ApiException.notFound("Usage limit not found"));
        LimitWindow newWindow = window != null ? window : current.window();
        if (current.kind() == LimitKind.CAP && newWindow != LimitWindow.TOTAL) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("window", "cap limits always use TOTAL")));
        }
        String newDescription = description != null ? description.trim() : current.description();
        Instant now = timeProvider.now();
        repository.update(limitId, newWindow, maxValue, newDescription, actor.userId(), now);

        Map<String, Object> details = new LinkedHashMap<>();
        details.put("limitKey", current.key());
        details.put(
                "previousMaxValue", current.maxValue() == null ? "unlimited" : current.maxValue());
        details.put("maxValue", maxValue == null ? "unlimited" : maxValue);
        details.put("previousWindow", current.window().name());
        details.put("window", newWindow.name());
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_LIMIT_UPDATE,
                TARGET_USAGE_LIMIT,
                limitId.toString(),
                details);
        evictAfterCommit();
        return new UsageLimitRule(
                limitId,
                current.key(),
                current.kind(),
                newWindow,
                maxValue,
                newDescription,
                actor.userId(),
                now);
    }

    /** Drops the cached limits (admin writes, tests). */
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
    public record RulesSnapshot(List<UsageLimitRule> limits) {}
}
