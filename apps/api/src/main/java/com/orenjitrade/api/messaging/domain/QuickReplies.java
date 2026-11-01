package com.orenjitrade.api.messaging.domain;

import java.util.Set;

/**
 * The fixed quick replies of the phone's chat (owner spec 2026-10-14, section 10; section 16,
 * default 10), the same list as {@code QUICK_REPLIES} in the phone's {@code chatCopy.ts}. A
 * collector answering several buyers with "Yes, still available" repeats it by design, so these
 * exact texts are left out of the repeated-content thresholds (stage R4, review fix 1, P2); the
 * rate limits and the banned-term rules apply to them like any message (section 13).
 */
public final class QuickReplies {

    /** The ten texts, exactly as the phone sends them. */
    public static final Set<String> TEXTS =
            Set.of(
                    "Is it still available?",
                    "How much with shipping?",
                    "e-Transfer sent!",
                    "Tracking number?",
                    "Thanks!",
                    "Yes, still available",
                    "Send me your address",
                    "Got your e-Transfer",
                    "Shipped!",
                    "Thanks for buying!");

    private QuickReplies() {}

    /** Whether a message's text is one of the quick replies, exactly. */
    public static boolean isQuickReply(String body) {
        return TEXTS.contains(body);
    }
}
