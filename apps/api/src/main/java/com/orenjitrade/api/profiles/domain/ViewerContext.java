package com.orenjitrade.api.profiles.domain;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Who is looking at a collector, as far as the privacy rules care.
 *
 * @param userId the viewer's account, {@code null} for a signed-out visitor
 * @param hasCompletedProfile whether the viewer saved their own profile (messaging rule)
 * @param blocked whether a block exists between viewer and target in either direction
 */
public record ViewerContext(@Nullable UUID userId, boolean hasCompletedProfile, boolean blocked) {

    public static final ViewerContext ANONYMOUS = new ViewerContext(null, false, false);

    public boolean isMember() {
        return userId != null;
    }

    public boolean is(UUID targetId) {
        return targetId.equals(userId);
    }
}
