package com.orenjitrade.api.moderation.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.moderation.infra.ModerationRuleRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Admin console CRUD of {@code moderation_rule} (Phase 7 contract "Collector Reports / Moderation";
 * ADR 0014). Reading is open to moderators; changes need ADMIN or SUPER_ADMIN ({@code 403}
 * otherwise), are validated (kind/scope combinations, regular expressions, {@code
 * <count>/<seconds>} patterns), audited ({@code moderation.rule.create|update|delete}) and drop the
 * per-instance rule caches after commit (other instances refresh within a minute).
 */
@Service
public class ModerationRuleService {

    public static final String ACTION_CREATE = "moderation.rule.create";
    public static final String ACTION_UPDATE = "moderation.rule.update";
    public static final String ACTION_DELETE = "moderation.rule.delete";
    public static final String TARGET_RULE = "MODERATION_RULE";
    static final int PATTERN_MAX = 200;

    private static final Pattern RATE_SYNTAX = Pattern.compile("^[1-9][0-9]{0,5}/[1-9][0-9]{0,6}$");

    private final ModerationRuleRepository repository;
    private final ModerationService moderationService;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public ModerationRuleService(
            ModerationRuleRepository repository,
            ModerationService moderationService,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.moderationService = moderationService;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    /** Every rule, grouped by scope and kind. */
    @Transactional(readOnly = true)
    public List<ModerationRuleView> list(
            @Nullable ModerationScope scope, @Nullable ModerationRuleKind kind) {
        return repository.findAll().stream()
                .filter(rule -> scope == null || rule.getScope() == scope)
                .filter(rule -> kind == null || rule.getKind() == kind)
                .sorted(
                        Comparator.comparing((ModerationRule rule) -> rule.getScope().name())
                                .thenComparing(rule -> rule.getKind().name())
                                .thenComparing(ModerationRule::getPattern)
                                .thenComparing(ModerationRule::getId))
                .map(ModerationRuleView::of)
                .toList();
    }

    @Transactional
    public ModerationRuleView create(AuthenticatedUser actor, RuleInput input) {
        requireAdmin(actor);
        String pattern = validate(input.kind(), input.scope(), input.pattern());
        Instant now = timeProvider.now();
        ModerationRule rule =
                repository.save(
                        new ModerationRule(
                                input.kind(),
                                pattern,
                                input.action(),
                                input.scope(),
                                input.active(),
                                actor.userId(),
                                now));
        audit(actor, ACTION_CREATE, rule.getId(), Map.of("rule", values(rule)));
        invalidateAfterCommit();
        return ModerationRuleView.of(rule);
    }

    /** Changes pattern, action, scope and the active switch (the kind is fixed). */
    @Transactional
    public ModerationRuleView update(AuthenticatedUser actor, UUID id, RuleChange change) {
        requireAdmin(actor);
        ModerationRule rule =
                repository
                        .findById(id)
                        .orElseThrow(() -> ApiException.notFound("Moderation rule not found"));
        ModerationScope scope = change.scope() != null ? change.scope() : rule.getScope();
        String pattern =
                validate(
                        rule.getKind(),
                        scope,
                        change.pattern() != null ? change.pattern() : rule.getPattern());
        Map<String, Object> previous = values(rule);
        rule.update(
                pattern,
                change.action() != null ? change.action() : rule.getAction(),
                scope,
                change.active() != null ? change.active() : rule.isActive(),
                actor.userId(),
                timeProvider.now());
        repository.save(rule);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("previous", previous);
        details.put("updated", values(rule));
        audit(actor, ACTION_UPDATE, id, details);
        invalidateAfterCommit();
        return ModerationRuleView.of(rule);
    }

    /** Deletes a rule (flags it raised keep their history without the rule reference). */
    @Transactional
    public void delete(AuthenticatedUser actor, UUID id) {
        requireAdmin(actor);
        ModerationRule rule =
                repository
                        .findById(id)
                        .orElseThrow(() -> ApiException.notFound("Moderation rule not found"));
        Map<String, Object> previous = values(rule);
        repository.delete(rule);
        audit(actor, ACTION_DELETE, id, Map.of("rule", previous));
        invalidateAfterCommit();
    }

    /**
     * Validates a rule and returns its trimmed pattern ({@code 400} with field errors otherwise).
     * Allowed kinds per scope: MESSAGE and POST take every content kind (banned terms, rate limits,
     * repeated-content thresholds), TAG and PROFILE banned terms only, REPORT a rate limit per
     * reporter and the report threshold.
     */
    static String validate(ModerationRuleKind kind, ModerationScope scope, @Nullable String raw) {
        List<ProblemFieldError> errors = new ArrayList<>();
        String pattern = raw == null ? "" : raw.trim();
        if (!scopesOf(kind).contains(scope)) {
            errors.add(
                    new ProblemFieldError(
                            "scope", kind + " rules cannot apply to the " + scope + " scope"));
        }
        if (pattern.isEmpty() || pattern.length() > PATTERN_MAX) {
            errors.add(new ProblemFieldError("pattern", "must be 1 to 200 characters"));
        } else if (kind == ModerationRuleKind.BANNED_TERM) {
            try {
                Pattern.compile(TextModerationService.normalise(pattern));
            } catch (PatternSyntaxException e) {
                errors.add(new ProblemFieldError("pattern", "is not a valid regular expression"));
            }
        } else if (!RATE_SYNTAX.matcher(pattern).matches()) {
            errors.add(
                    new ProblemFieldError(
                            "pattern", "must be <count>/<seconds>, for example 5/86400"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        return pattern;
    }

    static Set<ModerationScope> scopesOf(ModerationRuleKind kind) {
        return switch (kind) {
            case BANNED_TERM ->
                    EnumSet.of(
                            ModerationScope.MESSAGE,
                            ModerationScope.POST,
                            ModerationScope.TAG,
                            ModerationScope.PROFILE);
            case RATE_LIMIT ->
                    EnumSet.of(
                            ModerationScope.MESSAGE, ModerationScope.POST, ModerationScope.REPORT);
            case THRESHOLD -> EnumSet.of(ModerationScope.MESSAGE, ModerationScope.POST);
            case REPORT_THRESHOLD -> EnumSet.of(ModerationScope.REPORT);
        };
    }

    private static void requireAdmin(AuthenticatedUser actor) {
        if (!actor.isAdmin()) {
            throw ApiException.forbidden("Only an ADMIN can change moderation rules");
        }
    }

    private void audit(AuthenticatedUser actor, String action, UUID id, Map<String, ?> details) {
        auditService.record(
                ActorType.ADMIN, actor.userId(), action, TARGET_RULE, id.toString(), details);
    }

    private static Map<String, Object> values(ModerationRule rule) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("kind", rule.getKind().name());
        values.put("scope", rule.getScope().name());
        values.put("pattern", rule.getPattern());
        values.put("action", rule.getAction().name());
        values.put("active", rule.isActive());
        return values;
    }

    private void invalidateAfterCommit() {
        moderationService.invalidate();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            moderationService.invalidate();
                        }
                    });
        }
    }

    /** A new rule. */
    public record RuleInput(
            ModerationRuleKind kind,
            String pattern,
            ModerationAction action,
            ModerationScope scope,
            boolean active) {}

    /** Changes of a rule; {@code null} members stay unchanged. */
    public record RuleChange(
            @Nullable String pattern,
            @Nullable ModerationAction action,
            @Nullable ModerationScope scope,
            @Nullable Boolean active) {}

    /**
     * A rule as shown in the admin console.
     *
     * @param id rule id
     * @param kind kind
     * @param pattern regular expression or {@code <count>/<seconds>}
     * @param action FLAG or BLOCK
     * @param scope where it applies
     * @param active whether it is evaluated
     * @param createdAt creation
     * @param updatedAt last change
     * @param updatedBy last admin editor ({@code null} for migration rows)
     */
    public record ModerationRuleView(
            UUID id,
            ModerationRuleKind kind,
            String pattern,
            ModerationAction action,
            ModerationScope scope,
            boolean active,
            Instant createdAt,
            Instant updatedAt,
            @Nullable UUID updatedBy) {

        static ModerationRuleView of(ModerationRule rule) {
            return new ModerationRuleView(
                    rule.getId(),
                    rule.getKind(),
                    rule.getPattern(),
                    rule.getAction(),
                    rule.getScope(),
                    rule.isActive(),
                    rule.getCreatedAt(),
                    rule.getUpdatedAt(),
                    rule.getUpdatedBy());
        }
    }
}
