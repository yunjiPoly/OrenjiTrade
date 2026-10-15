package com.orenjitrade.api.cards.domain.scan;

import com.orenjitrade.api.cards.domain.CatalogText;
import java.util.HashSet;
import java.util.Set;

/**
 * How close a name read from a card is to a catalog card's name: 1 for the same name after {@link
 * CatalogText#normalise} (case, accents and runs of spaces ignored), else the trigram similarity of
 * PostgreSQL's {@code pg_trgm} ({@code similarity()}: shared trigrams over all trigrams of the two
 * names, each word padded with two spaces before and one after), raised to the share of the name
 * that was read when the name starts with it (a read cut short). Pure.
 */
public final class NameSimilarity {

    /** A read shorter than this is never taken for the start of a name. */
    static final int MIN_PREFIX = 3;

    private NameSimilarity() {}

    /** The name as compared: normalised, inner runs of spaces made one space. */
    public static String key(String name) {
        return CatalogText.normalise(name).replaceAll("\\s+", " ");
    }

    /** How close {@code read} is to {@code cardName}, from 0 to 1. */
    public static double score(String read, String cardName) {
        String r = key(read);
        String n = key(cardName);
        if (r.isEmpty() || n.isEmpty()) {
            return 0;
        }
        if (r.equals(n)) {
            return 1;
        }
        double score = similarity(r, n);
        if (r.length() >= MIN_PREFIX && n.startsWith(r)) {
            score = Math.max(score, (double) r.length() / n.length());
        }
        return score;
    }

    /** {@code pg_trgm}'s {@code similarity(a, b)} for two normalised texts. */
    static double similarity(String a, String b) {
        Set<String> left = trigrams(a);
        Set<String> right = trigrams(b);
        if (left.isEmpty() || right.isEmpty()) {
            return 0;
        }
        int shared = 0;
        for (String trigram : left) {
            if (right.contains(trigram)) {
                shared++;
            }
        }
        return (double) shared / (left.size() + right.size() - shared);
    }

    /** The trigrams of a text: each word of letters and digits as {@code " word "}. */
    static Set<String> trigrams(String text) {
        Set<String> trigrams = new HashSet<>();
        StringBuilder word = new StringBuilder();
        for (int i = 0; i <= text.length(); i++) {
            char c = i < text.length() ? text.charAt(i) : ' ';
            if (Character.isLetterOrDigit(c)) {
                word.append(c);
            } else if (word.length() > 0) {
                String padded = "  " + word + " ";
                for (int j = 0; j + 3 <= padded.length(); j++) {
                    trigrams.add(padded.substring(j, j + 3));
                }
                word.setLength(0);
            }
        }
        return trigrams;
    }
}
