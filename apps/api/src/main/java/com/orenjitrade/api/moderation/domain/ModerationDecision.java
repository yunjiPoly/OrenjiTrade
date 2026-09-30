package com.orenjitrade.api.moderation.domain;

import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Outcome of {@link ModerationService#check}: either blocked (the caller rejects the write with 422
 * and stores nothing) or accepted with the flags to record once the content exists.
 *
 * @param blocked whether a BLOCK rule applied
 * @param flags flags to record against the stored content ({@link ModerationService#recordFlags});
 *     non-empty means the content is stored {@code FLAGGED}
 */
public record ModerationDecision(boolean blocked, List<PendingFlag> flags) {

    public static final ModerationDecision ALLOWED = new ModerationDecision(false, List.of());
    public static final ModerationDecision BLOCKED = new ModerationDecision(true, List.of());

    public ModerationDecision {
        flags = List.copyOf(flags);
    }

    /** Whether the accepted content must be stored as FLAGGED. */
    public boolean flagged() {
        return !blocked && !flags.isEmpty();
    }

    /**
     * A flag to record.
     *
     * @param reason why
     * @param ruleId the rule that fired
     */
    public record PendingFlag(FlagReason reason, @Nullable UUID ruleId) {}
}
