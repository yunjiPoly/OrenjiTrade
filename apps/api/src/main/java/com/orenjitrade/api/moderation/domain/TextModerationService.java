package com.orenjitrade.api.moderation.domain;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.moderation.infra.ModerationRuleRepository;
import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Evaluates user-provided text (custom tags, profile text; later messages and posts) against the
 * active {@code BANNED_TERM} rules of {@code moderation_rule}. Patterns are case-insensitive
 * regular expressions matched against the text with accents stripped. Rules are cached per instance
 * for {@link #CACHE_TTL} (ADR 0014: admin changes apply within a minute); an invalid pattern is
 * skipped with a warning instead of breaking every write.
 */
@Service
public class TextModerationService {

    static final Duration CACHE_TTL = Duration.ofSeconds(60);

    private static final Logger log = LoggerFactory.getLogger(TextModerationService.class);
    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");

    private final ModerationRuleRepository repository;
    private final TimeProvider timeProvider;

    private volatile @Nullable Snapshot snapshot;

    public TextModerationService(ModerationRuleRepository repository, TimeProvider timeProvider) {
        this.repository = repository;
        this.timeProvider = timeProvider;
    }

    /** The strictest verdict of the active rules of {@code scope} matching {@code text}. */
    public ModerationVerdict evaluate(ModerationScope scope, @Nullable String text) {
        if (text == null || text.isBlank()) {
            return ModerationVerdict.ALLOW;
        }
        String normalised = normalise(text);
        ModerationVerdict verdict = ModerationVerdict.ALLOW;
        for (CompiledRule rule : rules().getOrDefault(scope, List.of())) {
            if (rule.pattern().matcher(normalised).find()) {
                if (rule.action() == ModerationAction.BLOCK) {
                    return ModerationVerdict.BLOCK;
                }
                verdict = ModerationVerdict.FLAG;
            }
        }
        return verdict;
    }

    /**
     * Every active {@code BANNED_TERM} rule of {@code scope} matching {@code text}, BLOCK rules
     * first (the moderation service records FLAG matches against the stored content).
     */
    public List<RuleMatch> matches(ModerationScope scope, @Nullable String text) {
        if (text == null || text.isBlank()) {
            return List.of();
        }
        String normalised = normalise(text);
        List<RuleMatch> matches = new ArrayList<>();
        for (CompiledRule rule : rules().getOrDefault(scope, List.of())) {
            if (rule.pattern().matcher(normalised).find()) {
                matches.add(new RuleMatch(rule.id(), rule.action()));
            }
        }
        matches.sort(
                (left, right) ->
                        Boolean.compare(
                                right.action() == ModerationAction.BLOCK,
                                left.action() == ModerationAction.BLOCK));
        return matches;
    }

    /** Drops the cached rules (admin edits, tests). */
    public void invalidate() {
        snapshot = null;
    }

    /** Lower case, accents stripped (the form patterns and repeated-content digests use). */
    public static String normalise(String text) {
        String decomposed = Normalizer.normalize(text, Normalizer.Form.NFD);
        return DIACRITICS.matcher(decomposed).replaceAll("").toLowerCase(Locale.ROOT);
    }

    private Map<ModerationScope, List<CompiledRule>> rules() {
        Instant now = timeProvider.now();
        @Nullable Snapshot current = snapshot;
        if (current != null && current.loadedAt().plus(CACHE_TTL).isAfter(now)) {
            return current.rules();
        }
        Snapshot loaded = new Snapshot(now, load());
        snapshot = loaded;
        return loaded.rules();
    }

    private Map<ModerationScope, List<CompiledRule>> load() {
        Map<ModerationScope, List<CompiledRule>> byScope = new EnumMap<>(ModerationScope.class);
        for (ModerationRule rule :
                repository.findByKindAndActiveTrue(ModerationRuleKind.BANNED_TERM)) {
            try {
                Pattern pattern =
                        Pattern.compile(
                                normalise(rule.getPattern()),
                                Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
                byScope.computeIfAbsent(rule.getScope(), scope -> new ArrayList<>())
                        .add(new CompiledRule(rule.getId(), pattern, rule.getAction()));
            } catch (PatternSyntaxException e) {
                log.warn("Skipping moderation rule {}: invalid pattern", rule.getId());
            }
        }
        return byScope;
    }

    record CompiledRule(UUID id, Pattern pattern, ModerationAction action) {}

    /**
     * A matching rule.
     *
     * @param ruleId the {@code moderation_rule} row
     * @param action what the rule asks for
     */
    public record RuleMatch(UUID ruleId, ModerationAction action) {}

    private record Snapshot(Instant loadedAt, Map<ModerationScope, List<CompiledRule>> rules) {}
}
