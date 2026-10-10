package com.orenjitrade.api.ads.domain;

import com.orenjitrade.api.ads.domain.AdEnums.TargetingKind;
import java.util.Collection;
import java.util.EnumMap;
import java.util.Map;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * Targeting rules (pure): kinds combine with AND, values of one kind with OR, and a kind without
 * rules matches everybody. Rules only ever compare public values of the {@link AdContext}: codes of
 * platform regions, countries and subdivisions, never a city or a coordinate (ADR 0017).
 */
public final class Targeting {

    /** Slugs of games and tags. */
    public static final Pattern SLUG = Pattern.compile("^[a-z0-9][a-z0-9-]{0,59}$");

    /** A platform region code ({@code americas-north}). */
    public static final Pattern REGION_CODE = Pattern.compile("^[a-z]+(-[a-z]+){0,3}$");

    /** An ISO 3166-1 alpha-2 country code. */
    public static final Pattern COUNTRY_CODE = Pattern.compile("^[A-Z]{2}$");

    /** An ISO 3166-2 code, or the alpha-2 code of a whole-country pseudo-subdivision. */
    public static final Pattern SUBDIVISION_CODE = Pattern.compile("^[A-Z]{2}(-[A-Z0-9]{1,3})?$");

    private Targeting() {}

    /**
     * A targeting rule.
     *
     * @param kind what it compares
     * @param value the value to match
     */
    public record Rule(TargetingKind kind, String value) {}

    /** Whether a campaign with {@code rules} may be shown in {@code context}. */
    public static boolean matches(Collection<Rule> rules, AdContext context) {
        Map<TargetingKind, Boolean> satisfied = new EnumMap<>(TargetingKind.class);
        for (Rule rule : rules) {
            boolean match = matches(rule, context);
            satisfied.merge(rule.kind(), match, Boolean::logicalOr);
        }
        return !satisfied.containsValue(false);
    }

    static boolean matches(Rule rule, AdContext context) {
        String value = rule.value();
        return switch (rule.kind()) {
            case GAME ->
                    context.game() != null
                            ? context.game().equalsIgnoreCase(value)
                            : context.interestGames().stream().anyMatch(value::equalsIgnoreCase);
            case REGION -> same(context.regionCode(), value);
            case COUNTRY -> same(context.countryCode(), value);
            case SUBDIVISION -> same(context.subdivisionCode(), value);
            case TAG -> context.tags().stream().anyMatch(value::equalsIgnoreCase);
            case PLAN -> context.planCode().equalsIgnoreCase(value);
        };
    }

    private static boolean same(@Nullable String actual, String wanted) {
        return actual != null && actual.equalsIgnoreCase(wanted);
    }
}
