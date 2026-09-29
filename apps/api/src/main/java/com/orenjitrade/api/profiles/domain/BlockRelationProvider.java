package com.orenjitrade.api.profiles.domain;

import java.util.UUID;

/**
 * Extension point: whether a block exists between two members in either direction, implemented by
 * the messaging module (Phase 5). Without an implementation nobody is blocked.
 */
public interface BlockRelationProvider {

    boolean isBlocked(UUID viewerId, UUID targetId);
}
