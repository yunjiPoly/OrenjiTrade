package com.orenjitrade.api.profiles.domain;

import java.util.UUID;

/**
 * Extension point: whether a collector is connected right now, implemented with the realtime
 * presence of Phase 5. Without an implementation everybody is offline.
 */
public interface PresenceProvider {

    boolean isOnline(UUID userId);
}
