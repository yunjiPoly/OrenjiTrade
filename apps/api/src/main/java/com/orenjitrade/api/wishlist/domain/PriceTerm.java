package com.orenjitrade.api.wishlist.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * A price term a wish may show, relative to the TCG market price of the wished printing ({@code
 * "85% TCG"}, {@code "100% TCG+"} for "100 % or more"). A display term for sellers, never a filter.
 * The label is the stored value ({@code wishlist_item.price_term}) and the admin-configurable list
 * ({@code platform_settings wishlist.price_terms}) holds labels; percent and "or more" are read
 * from it.
 *
 * @param label as shown ({@code "85% TCG"})
 * @param percent percent of the market price (1-200)
 * @param orMore whether the term means "this percent or more" (the {@code +})
 */
public record PriceTerm(String label, int percent, boolean orMore) {

    /** Label pattern: a percent without leading zero, {@code "% TCG"}, an optional {@code +}. */
    public static final Pattern LABEL = Pattern.compile("^([1-9]\\d{0,2})% TCG(\\+)?$");

    public static final int MIN_PERCENT = 1;
    public static final int MAX_PERCENT = 200;

    /** Parses a label (surrounding blanks ignored); empty when it is not a valid term. */
    public static Optional<PriceTerm> parse(@Nullable String value) {
        if (value == null) {
            return Optional.empty();
        }
        String label = value.strip();
        Matcher matcher = LABEL.matcher(label);
        if (!matcher.matches()) {
            return Optional.empty();
        }
        int percent = Integer.parseInt(matcher.group(1));
        if (percent < MIN_PERCENT || percent > MAX_PERCENT) {
            return Optional.empty();
        }
        return Optional.of(new PriceTerm(label, percent, matcher.group(2) != null));
    }

    /**
     * The approximate amount of this term for a market price ({@code 85% of 25.00 = 21.25}), two
     * decimals, half up.
     */
    public BigDecimal approximate(BigDecimal marketPrice) {
        return marketPrice
                .multiply(BigDecimal.valueOf(percent))
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }
}
