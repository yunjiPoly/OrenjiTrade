package com.orenjitrade.api.users.domain;

import java.util.random.RandomGenerator;
import java.util.regex.Pattern;

/**
 * The first handle of a freshly provisioned account: {@code collector_} and six random characters
 * (for example {@code collector_k7mq2x}). It is never derived from the e-mail address or any other
 * identity claim, so a public handle reveals no part of the address and the handle check cannot
 * tell whether an address has an account (stage R12, review fix 2). The collector picks their own
 * handle in the welcome ("Who are you?") or under Edit profile. The random part uses consonants and
 * digits without look-alikes (no vowels, so it never spells a word; no {@code 0}, {@code 1}, {@code
 * i}, {@code l}, {@code o} or {@code y}). Collisions are resolved by the caller, which draws again.
 */
public final class HandleGenerator {

    public static final int MIN_LENGTH = 3;
    public static final int MAX_LENGTH = 24;
    public static final Pattern VALID = Pattern.compile("^[a-z0-9_]{3,24}$");

    static final String PREFIX = "collector_";
    static final int RANDOM_LENGTH = 6;
    static final String ALPHABET = "bcdfghjkmnpqrstvwxz23456789";

    private HandleGenerator() {}

    /** A random first handle: {@link #PREFIX} and {@link #RANDOM_LENGTH} random characters. */
    public static String random(RandomGenerator random) {
        StringBuilder handle = new StringBuilder(PREFIX.length() + RANDOM_LENGTH).append(PREFIX);
        for (int i = 0; i < RANDOM_LENGTH; i++) {
            handle.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return handle.toString();
    }

    public static boolean isValid(String handle) {
        return VALID.matcher(handle).matches();
    }
}
