package com.orenjitrade.api.moderation.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.ratelimit.RateLimiter;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.moderation.domain.ModerationDecision.PendingFlag;
import com.orenjitrade.api.moderation.domain.TextModerationService.RuleMatch;
import com.orenjitrade.api.moderation.infra.ModerationFlagRepository;
import com.orenjitrade.api.moderation.infra.ModerationRuleRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Auto-moderation hooks of messages, community posts and replies (Phase 5 contract "Auto-moderation
 * hooks"). {@link #check} applies the active {@code moderation_rule}s of a scope:
 *
 * <ol>
 *   <li>{@code RATE_LIMIT} ({@code <count>/<seconds>}): per-author fixed windows in Redis; BLOCK →
 *       {@code 429 RATE_LIMITED}, FLAG → one open {@code USER} flag;
 *   <li>{@code BANNED_TERM}: through {@link TextModerationService}; BLOCK → blocked, FLAG → flag on
 *       the stored content;
 *   <li>{@code THRESHOLD} ({@code <count>/<seconds>}): repeated-content detection per author on the
 *       SHA-256 of the normalised text (never the text itself); BLOCK → blocked, FLAG → flag.
 * </ol>
 *
 * No automatic ban: thresholds create flags for human review only. Rules are cached per instance
 * for {@link #CACHE_TTL} (ADR 0014); Redis failures fail open.
 */
@Service
public class ModerationService {

    public static final Duration CACHE_TTL = Duration.ofSeconds(60);
    public static final String ACTION_RESOLVE_FLAG = "moderation.flag.resolve";
    public static final String TARGET_FLAG = "MODERATION_FLAG";

    static final String RATE_KEY_PREFIX = "mod:rate:";
    static final String REPEAT_KEY_PREFIX = "mod:repeat:";

    private static final Logger log = LoggerFactory.getLogger(ModerationService.class);
    private static final Pattern SPACES = Pattern.compile("\\s+");

    private final TextModerationService textModeration;
    private final ModerationRuleRepository rules;
    private final ModerationFlagRepository flags;
    private final RateLimiter limiter;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    private volatile @Nullable Snapshot snapshot;

    public ModerationService(
            TextModerationService textModeration,
            ModerationRuleRepository rules,
            ModerationFlagRepository flags,
            RateLimiter limiter,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.textModeration = textModeration;
        this.rules = rules;
        this.flags = flags;
        this.limiter = limiter;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    // ---------------------------------------------------------------------------------------
    // Checks
    // ---------------------------------------------------------------------------------------

    /**
     * Applies the rules of {@code scope} to a write of {@code authorId}. Throws {@code 429
     * RATE_LIMITED} when a BLOCK rate rule is exceeded; otherwise returns whether the content is
     * blocked and which flags to record once it is stored.
     */
    public ModerationDecision check(ModerationScope scope, @Nullable String text, UUID authorId) {
        Snapshot current = snapshot();
        for (RateRule rule : current.rates().getOrDefault(scope, List.of())) {
            OptionalLong count =
                    limiter.hit(
                            RATE_KEY_PREFIX + scope + ":" + rule.id() + ":" + authorId,
                            rule.windowMillis());
            if (count.isEmpty() || count.getAsLong() <= rule.limit()) {
                continue;
            }
            if (rule.action() == ModerationAction.BLOCK) {
                throw new ApiException(
                                ErrorCode.RATE_LIMITED,
                                "You are posting too quickly. Please wait a moment and try again.")
                        .withProperty("retryAfterSeconds", rule.windowSeconds());
            }
            if (count.getAsLong() == rule.limit() + 1L) {
                flags.open(
                        FlagSubjectType.USER,
                        authorId,
                        rule.id(),
                        FlagReason.RATE_THRESHOLD,
                        authorId,
                        timeProvider.now());
            }
        }
        List<PendingFlag> pending = new ArrayList<>();
        for (RuleMatch match : textModeration.matches(scope, text)) {
            if (match.action() == ModerationAction.BLOCK) {
                return ModerationDecision.BLOCKED;
            }
            pending.add(new PendingFlag(FlagReason.BANNED_TERM, match.ruleId()));
        }
        if (text != null && !text.isBlank()) {
            String digest = digest(text);
            for (RateRule rule : current.thresholds().getOrDefault(scope, List.of())) {
                OptionalLong count =
                        limiter.hit(
                                REPEAT_KEY_PREFIX
                                        + scope
                                        + ":"
                                        + rule.id()
                                        + ":"
                                        + authorId
                                        + ":"
                                        + digest,
                                rule.windowMillis());
                if (count.isEmpty() || count.getAsLong() <= rule.limit()) {
                    continue;
                }
                if (rule.action() == ModerationAction.BLOCK) {
                    return ModerationDecision.BLOCKED;
                }
                pending.add(new PendingFlag(FlagReason.REPEATED_CONTENT, rule.id()));
            }
        }
        return pending.isEmpty()
                ? ModerationDecision.ALLOWED
                : new ModerationDecision(false, pending);
    }

    /**
     * Records the flags of an accepted, stored piece of content (joins the caller's transaction).
     */
    @Transactional
    public void recordFlags(
            ModerationDecision decision,
            FlagSubjectType subjectType,
            UUID subjectId,
            UUID authorId) {
        Instant now = timeProvider.now();
        for (PendingFlag flag : decision.flags()) {
            flags.open(subjectType, subjectId, flag.ruleId(), flag.reason(), authorId, now);
        }
        if (!decision.flags().isEmpty()) {
            log.info(
                    "Moderation flag(s) {} on {} {}",
                    decision.flags().stream().map(PendingFlag::reason).toList(),
                    subjectType,
                    subjectId);
        }
    }

    /**
     * SHA-256 (hex) of the normalised text: lower case, accents stripped, whitespace collapsed.
     * Used for repeated-content keys and duplicate-post detection; the text never reaches Redis.
     */
    public static String digest(String text) {
        String normalised =
                SPACES.matcher(TextModerationService.normalise(text).trim()).replaceAll(" ");
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            return HexFormat.of()
                    .formatHex(sha.digest(normalised.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    // ---------------------------------------------------------------------------------------
    // Review
    // ---------------------------------------------------------------------------------------

    /** {@code GET /admin/moderation/flags}: newest first. */
    @Transactional(readOnly = true)
    public PageResponse<ModerationFlagView> flags(
            @Nullable Boolean open, @Nullable FlagSubjectType subjectType, int page, int size) {
        ModerationFlagRepository.Page result = flags.page(open, subjectType, page, size);
        return PageResponse.of(result.rows(), page, size, result.total());
    }

    /** {@code POST /admin/moderation/flags/{id}/resolve} (audited). */
    @Transactional
    public ModerationFlagView resolve(AuthenticatedUser actor, UUID flagId, @Nullable String note) {
        ModerationFlagView existing =
                flags.findById(flagId)
                        .orElseThrow(() -> ApiException.notFound("Moderation flag not found"));
        if (!existing.open()) {
            throw ApiException.conflict("This flag is already resolved");
        }
        @Nullable String text = note == null || note.isBlank() ? null : note.trim();
        ModerationFlagView resolved =
                flags.resolve(flagId, actor.userId(), text, timeProvider.now())
                        .orElseThrow(() -> ApiException.conflict("This flag is already resolved"));
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("subjectType", resolved.subjectType().name());
        details.put("subjectId", resolved.subjectId().toString());
        details.put("reason", resolved.reason().name());
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_RESOLVE_FLAG,
                TARGET_FLAG,
                flagId.toString(),
                details);
        return resolved;
    }

    /**
     * Resolves the open flags of content a moderator removed (joins the caller's transaction, which
     * audits the removal itself).
     */
    @Transactional
    public int resolveSubject(
            FlagSubjectType subjectType, UUID subjectId, UUID moderatorId, String note) {
        return flags.resolveSubject(subjectType, subjectId, moderatorId, note, timeProvider.now());
    }

    /** Drops the cached rules (tests, later admin edits). */
    public void invalidate() {
        snapshot = null;
        textModeration.invalidate();
    }

    // ---------------------------------------------------------------------------------------
    // Rules
    // ---------------------------------------------------------------------------------------

    private Snapshot snapshot() {
        Instant now = timeProvider.now();
        @Nullable Snapshot current = snapshot;
        if (current != null && current.loadedAt().plus(CACHE_TTL).isAfter(now)) {
            return current;
        }
        Snapshot loaded =
                new Snapshot(
                        now,
                        load(ModerationRuleKind.RATE_LIMIT),
                        load(ModerationRuleKind.THRESHOLD));
        snapshot = loaded;
        return loaded;
    }

    private Map<ModerationScope, List<RateRule>> load(ModerationRuleKind kind) {
        Map<ModerationScope, List<RateRule>> byScope = new EnumMap<>(ModerationScope.class);
        for (ModerationRule rule : rules.findByKindAndActiveTrue(kind)) {
            Optional<RateRule> parsed =
                    RateRule.parse(rule.getId(), rule.getPattern(), rule.getAction());
            if (parsed.isEmpty()) {
                log.warn("Skipping moderation rule {}: invalid rate pattern", rule.getId());
                continue;
            }
            byScope.computeIfAbsent(rule.getScope(), scope -> new ArrayList<>()).add(parsed.get());
        }
        return byScope;
    }

    private record Snapshot(
            Instant loadedAt,
            Map<ModerationScope, List<RateRule>> rates,
            Map<ModerationScope, List<RateRule>> thresholds) {}
}
