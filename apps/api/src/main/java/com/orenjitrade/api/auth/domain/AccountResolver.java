package com.orenjitrade.api.auth.domain;

import java.util.UUID;

/**
 * SPI through which the bearer token filter reaches the account store. Implemented by the users
 * module (which provisions the account on the first call), so auth never depends on users.
 */
public interface AccountResolver {

    /** Loads (or provisions) the account behind a verified identity. */
    ResolvedAccount resolve(VerifiedIdentity identity);

    /** Records that the account was seen just now; implementations throttle the write. */
    void recordActivity(UUID userId);
}
