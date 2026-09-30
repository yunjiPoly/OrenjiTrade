package com.orenjitrade.api.messaging.domain;

import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * The one-line preview of a message shown in conversation lists ({@code
 * conversation.last_message_preview}). Pure; unit-tested.
 */
public final class MessagePreviews {

    /** Longest preview (characters, ellipsis included). */
    public static final int MAX = 140;

    private static final Pattern SPACES = Pattern.compile("\\s+");

    private MessagePreviews() {}

    /**
     * @param kind message kind
     * @param body message text (may be empty)
     * @param linkName name of the shared card or binder, when any
     */
    public static String of(MessageKind kind, String body, @Nullable String linkName) {
        String text = SPACES.matcher(body).replaceAll(" ").strip();
        return switch (kind) {
            case TEXT, SYSTEM -> truncate(text);
            case CARD_LINK -> truncate("Card: " + (linkName == null ? "" : linkName));
            case BINDER_LINK -> truncate("Binder: " + (linkName == null ? "" : linkName));
            case IMAGE -> text.isEmpty() ? "Photo" : truncate("Photo: " + text);
            case OFFER_LINK -> "Offer";
        };
    }

    /** At most {@link #MAX} characters, cut on a code point boundary with an ellipsis. */
    static String truncate(String text) {
        if (text.codePointCount(0, text.length()) <= MAX) {
            return text;
        }
        int end = text.offsetByCodePoints(0, MAX - 1);
        return text.substring(0, end).stripTrailing() + "…";
    }
}
