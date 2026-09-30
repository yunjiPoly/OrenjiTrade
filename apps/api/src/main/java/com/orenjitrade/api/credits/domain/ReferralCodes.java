package com.orenjitrade.api.credits.domain;

import java.security.SecureRandom;
import java.util.Locale;
import java.util.Optional;
import java.util.random.RandomGenerator;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * Referral code rules: 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown and
 * stored upper case; input is normalised (case, spaces and dashes ignored).
 */
public final class ReferralCodes {

    public static final String ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    public static final int LENGTH = 8;

    static final Pattern STORED = Pattern.compile("^[A-Z0-9]{6,16}$");

    private static final SecureRandom RANDOM = new SecureRandom();

    private ReferralCodes() {}

    /** A new random code. */
    public static String generate() {
        return generate(RANDOM);
    }

    static String generate(RandomGenerator random) {
        StringBuilder code = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return code.toString();
    }

    /** The stored form of user input, empty when it cannot be a code. */
    public static Optional<String> normalise(@Nullable String input) {
        if (input == null) {
            return Optional.empty();
        }
        String code = input.replaceAll("[\\s-]", "").toUpperCase(Locale.ROOT);
        return STORED.matcher(code).matches() ? Optional.of(code) : Optional.empty();
    }
}
