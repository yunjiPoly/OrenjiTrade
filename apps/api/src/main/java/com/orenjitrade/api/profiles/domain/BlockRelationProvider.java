package com.orenjitrade.api.profiles.domain;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Extension point: whether a block exists between two members in either direction, implemented by
 * the messaging module (Phase 5). Without an implementation nobody is blocked.
 */
public interface BlockRelationProvider {

    boolean isBlocked(UUID viewerId, UUID targetId);

    /**
     * The targets with a block between them and the viewer (either direction). Implementations
     * answer with one query; the default asks {@link #isBlocked} per target.
     */
    default Set<UUID> blockedAmong(UUID viewerId, Collection<UUID> targetIds) {
        Set<UUID> blocked = new HashSet<>();
        for (UUID targetId : targetIds) {
            if (!targetId.equals(viewerId) && isBlocked(viewerId, targetId)) {
                blocked.add(targetId);
            }
        }
        return blocked;
    }
}
