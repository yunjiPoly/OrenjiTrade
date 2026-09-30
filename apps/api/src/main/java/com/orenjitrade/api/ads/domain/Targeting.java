package com.orenjitrade.api.ads.domain;

import com.orenjitrade.api.ads.domain.AdEnums.TargetingKind;
import java.text.Normalizer;
import java.util.Collection;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * Targeting rules (pure): kinds combine with AND, values of one kind with OR, and a kind without
 * rules matches everybody. Rules only ever compare public values of the {@link AdContext}.
 */
public final class Targeting {

    /** A grid cell id of the public ~1 km grid ({@code r<row>c<col>}). */
    public static final Pattern GEO_CELL = Pattern.compile("^r-?\\d{1,6}c-?\\d{1,6}$");

    /** Slugs of games and tags. */
    public static final Pattern SLUG = Pattern.compile("^[a-z0-9][a-z0-9-]{0,59}$");

    /** Something that looks like a coordinate (never allowed in a region label rule). */
    static final Pattern COORDINATE = Pattern.compile("-?\\d{1,3}\\.\\d+");

    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");

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
            case REGION_LABEL -> labelMatches(context.regionLabel(), value);
            case GEO_CELL -> context.geoCell() != null && context.geoCell().equalsIgnoreCase(value);
            case TAG -> context.tags().stream().anyMatch(value::equalsIgnoreCase);
            case PLAN -> context.planCode().equalsIgnoreCase(value);
        };
    }

    /**
     * A region label rule matches the whole label ("Plateau-Mont-Royal, Montréal"), one of its
     * comma-separated parts ("Montréal") or the city of a "Downtown X" / "Near X" part of the
     * static region geocoder, ignoring case and accents.
     */
    static boolean labelMatches(@Nullable String label, String value) {
        if (label == null || label.isBlank()) {
            return false;
        }
        String wanted = fold(value);
        if (fold(label).equals(wanted)) {
            return true;
        }
        for (String part : List.of(label.split(","))) {
            String folded = fold(part);
            for (String prefix : LABEL_PREFIXES) {
                if (folded.equals(prefix + wanted)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Qualifiers of a city in region labels ("Downtown X", "Near X"). */
    static final List<String> LABEL_PREFIXES = List.of("", "downtown ", "near ");

    /** Whether a region label value is acceptable (no coordinate-like numbers). */
    public static boolean acceptableRegionLabel(String value) {
        return !value.isBlank() && !COORDINATE.matcher(value).find();
    }

    static String fold(String text) {
        String decomposed = Normalizer.normalize(text.trim(), Normalizer.Form.NFD);
        return DIACRITICS.matcher(decomposed).replaceAll("").toLowerCase(Locale.ROOT);
    }
}
