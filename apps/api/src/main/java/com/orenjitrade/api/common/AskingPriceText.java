package com.orenjitrade.api.common;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * An asking price as a collector types it on the phone (owner spec 2026-10-14, section 12): free
 * text of at most {@value #MAX_LENGTH} characters ("85% TCG", "Trade only", "$12.50"), shown
 * exactly as typed. When the text is a plain amount it also gives the numeric price that the price
 * sort and the paused web use; the currency is the item's (the account's, CAD by default), never
 * read from the text.
 *
 * <p>A plain amount is a whole number of at most 10 digits with an optional decimal part of one or
 * two digits after a point or a comma, with an optional dollar sign before it or after it, spaces
 * allowed between the sign and the number: {@code 12}, {@code 12.5}, {@code 12.50}, {@code 12,50},
 * {@code $12.50}, {@code $ 12}, {@code 12,50 $} (the French way, the space may be a no-break
 * space). Anything else ({@code 12.}, {@code 1,200.00}, {@code 85% TCG}, {@code $12$}, {@code 12
 * CAD}) is text only.
 *
 * <p>Pure functions, shared by the inventory (stage R2) and the binders that sell as a deck core
 * (stage R3).
 */
public final class AskingPriceText {

    /** The longest text a collector may type. */
    public static final int MAX_LENGTH = 40;

    private static final String SPACE = "[\\s\\u00A0\\u202F]*";
    private static final String NUMBER = "(\\d{1,10})(?:[.,](\\d{1,2}))?";
    private static final Pattern SIGN_FIRST = Pattern.compile("^\\$" + SPACE + NUMBER + "$");
    private static final Pattern SIGN_AFTER = Pattern.compile("^" + NUMBER + SPACE + "\\$?$");
    private static final Pattern CONTROL = Pattern.compile("\\p{Cntrl}");

    private AskingPriceText() {}

    /**
     * The text as stored: stripped of leading and trailing white space, {@code null} when nothing
     * is left.
     */
    public static @Nullable String normalise(@Nullable String text) {
        if (text == null) {
            return null;
        }
        String stripped = text.strip();
        return stripped.isEmpty() ? null : stripped;
    }

    /**
     * Why a stored text would be refused (a field error message), or {@code null} when it is
     * acceptable: longer than {@value #MAX_LENGTH} characters, or holding a line break or another
     * control character (the price is one line).
     */
    public static @Nullable String problem(@Nullable String normalised) {
        if (normalised == null) {
            return null;
        }
        if (normalised.codePointCount(0, normalised.length()) > MAX_LENGTH) {
            return "must be at most " + MAX_LENGTH + " characters";
        }
        if (CONTROL.matcher(normalised).find()) {
            return "must be one line of text";
        }
        return null;
    }

    /** The amount of a plain-amount text, with two decimals; empty for any other text. */
    public static Optional<BigDecimal> amountOf(@Nullable String text) {
        String normalised = normalise(text);
        if (normalised == null) {
            return Optional.empty();
        }
        Matcher matcher = SIGN_FIRST.matcher(normalised);
        if (!matcher.matches()) {
            matcher = SIGN_AFTER.matcher(normalised);
            if (!matcher.matches()) {
                return Optional.empty();
            }
        }
        String whole = matcher.group(1);
        @Nullable String fraction = matcher.group(2);
        String decimal = whole + "." + (fraction == null ? "00" : fraction);
        return Optional.of(new BigDecimal(decimal).setScale(2));
    }
}
