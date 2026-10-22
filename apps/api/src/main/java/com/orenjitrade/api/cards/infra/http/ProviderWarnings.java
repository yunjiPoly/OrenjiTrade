package com.orenjitrade.api.cards.infra.http;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Client-safe notes about provider rows a mapper skipped, aggregated per category with a count and
 * a few examples each ({@code "3 non-English cards skipped (e.g. a, b, c)"}), for the import
 * report.
 */
public final class ProviderWarnings {

    public static final int MAX_EXAMPLES = 5;

    private final Map<String, List<String>> examples = new LinkedHashMap<>();
    private final Map<String, Integer> counts = new LinkedHashMap<>();

    /** Counts one row of {@code category}; {@code example} names it (blank: not named). */
    public void add(String category, String example) {
        counts.merge(category, 1, Integer::sum);
        List<String> list = examples.computeIfAbsent(category, k -> new ArrayList<>());
        String clean = example.replaceAll("[\\p{Cntrl}]", " ").strip();
        if (clean.length() > 60) {
            clean = clean.substring(0, 60) + "…";
        }
        if (list.size() < MAX_EXAMPLES && !clean.isEmpty() && !list.contains(clean)) {
            list.add(clean);
        }
    }

    /** How many rows of {@code category} were counted. */
    public int count(String category) {
        return counts.getOrDefault(category, 0);
    }

    /** One line per category, in the order the categories first occurred. */
    public List<String> messages() {
        List<String> messages = new ArrayList<>();
        counts.forEach(
                (category, count) -> {
                    List<String> named = examples.get(category);
                    messages.add(
                            count
                                    + " "
                                    + category
                                    + (named.isEmpty()
                                            ? ""
                                            : " (e.g. " + String.join(", ", named) + ")"));
                });
        return messages;
    }
}
