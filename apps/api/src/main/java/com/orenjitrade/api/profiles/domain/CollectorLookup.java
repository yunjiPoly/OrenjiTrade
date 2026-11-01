package com.orenjitrade.api.profiles.domain;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.profiles.infra.CollectorHandleRepository;
import com.orenjitrade.api.users.domain.HandleRules;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The account behind a handle for the public collector reads: the profile ({@code GET
 * /collectors/{handle}}), its ratings and references, its binders, cards and wishes. Empty, which
 * each read answers with the unknown handle's {@code 404}, when no account holds the handle, when
 * it is suspended, pending deletion or deleted, and when it blocked the viewer (owner decision of
 * 2026-10-28; the viewer who blocked it keeps the blocker's view). The first two and a block are
 * decided by one query ({@link CollectorHandleRepository}), before any of the account's data is
 * read.
 */
@Service
public class CollectorLookup {

    private final CollectorHandleRepository handles;
    private final UserAccountService accounts;
    private final TimeProvider timeProvider;

    public CollectorLookup(
            CollectorHandleRepository handles,
            UserAccountService accounts,
            TimeProvider timeProvider) {
        this.handles = handles;
        this.accounts = accounts;
        this.timeProvider = timeProvider;
    }

    /** The publicly visible account holding {@code handle}, as {@code viewerId} may reach it. */
    @Transactional(readOnly = true)
    public Optional<UserAccountSnapshot> visibleByHandle(@Nullable UUID viewerId, String handle) {
        Instant now = timeProvider.now();
        return handles.visibleId(HandleRules.normalise(handle), viewerId, now)
                .flatMap(accounts::findSnapshot)
                .filter(account -> CollectorProfileService.isPubliclyVisible(account, now));
    }
}
