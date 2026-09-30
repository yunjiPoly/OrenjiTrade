package com.orenjitrade.api.messaging.domain;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.messaging.events.UserBlocked;
import com.orenjitrade.api.messaging.events.UserUnblocked;
import com.orenjitrade.api.messaging.infra.BlockRepository;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.profiles.domain.MemberDirectory;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * User blocks (Phase 5 contract): {@code POST/DELETE /users/{id}/block}, {@code GET /me/blocks}. A
 * block in either direction hides conversations both ways, forbids new ones and hides the
 * collectors from each other on profiles, public binders and the map (through the {@code
 * BlockRelationProvider} of the profiles module).
 */
@Service
public class BlockService {

    public static final int REASON_MAX = 500;

    private final BlockRepository repository;
    private final MemberDirectory members;
    private final TimeProvider timeProvider;
    private final ApplicationEventPublisher events;

    public BlockService(
            BlockRepository repository,
            MemberDirectory members,
            TimeProvider timeProvider,
            ApplicationEventPublisher events) {
        this.repository = repository;
        this.members = members;
        this.timeProvider = timeProvider;
        this.events = events;
    }

    /**
     * Blocks {@code targetId} (idempotent). {@code 400} for oneself, {@code 404} for unknown or
     * deleted accounts.
     */
    @Transactional
    public BlockedUser block(UUID actorId, UUID targetId, @Nullable String reason) {
        if (actorId.equals(targetId)) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("id", "You cannot block yourself")));
        }
        MemberCard target =
                members.card(targetId)
                        .filter(card -> card.status() != AccountStatus.DELETED)
                        .orElseThrow(() -> ApiException.notFound("Collector not found"));
        @Nullable String note = reason == null || reason.isBlank() ? null : reason.strip();
        if (note != null && note.length() > REASON_MAX) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    "reason", "must be at most " + REASON_MAX + " characters")));
        }
        Instant now = timeProvider.now();
        if (repository.insert(actorId, targetId, note, now)) {
            events.publishEvent(new UserBlocked(actorId, targetId, now));
        }
        Instant blockedAt =
                repository.blockedBy(actorId).stream()
                        .filter(row -> row.blockedId().equals(targetId))
                        .map(BlockRepository.Row::createdAt)
                        .findFirst()
                        .orElse(now);
        return new BlockedUser(
                target.id(), target.handle(), target.displayName(), target.avatarUrl(), blockedAt);
    }

    /** Lifts the caller's block (idempotent: 204 whether or not it existed). */
    @Transactional
    public void unblock(UUID actorId, UUID targetId) {
        if (repository.delete(actorId, targetId)) {
            events.publishEvent(new UserUnblocked(actorId, targetId, timeProvider.now()));
        }
    }

    /** {@code GET /me/blocks}: the caller's blocks, newest first. */
    @Transactional(readOnly = true)
    public List<BlockedUser> blockedBy(UUID actorId) {
        List<BlockRepository.Row> rows = repository.blockedBy(actorId);
        Map<UUID, MemberCard> cards =
                members.cards(rows.stream().map(BlockRepository.Row::blockedId).toList());
        List<BlockedUser> result = new ArrayList<>();
        for (BlockRepository.Row row : rows) {
            MemberCard card = cards.get(row.blockedId());
            if (card != null) {
                result.add(
                        new BlockedUser(
                                card.id(),
                                card.handle(),
                                card.displayName(),
                                card.avatarUrl(),
                                row.createdAt()));
            }
        }
        return result;
    }

    /** Whether a block exists between the two accounts in either direction. */
    @Transactional(readOnly = true)
    public boolean isBlockedEitherWay(UUID a, UUID b) {
        return !a.equals(b) && repository.existsBetween(a, b);
    }

    /**
     * Accounts hidden from {@code viewerId} by a block in either direction (community feeds filter
     * their authors with it); empty for signed-out viewers.
     */
    @Transactional(readOnly = true)
    public Set<UUID> hiddenFrom(@Nullable UUID viewerId) {
        return viewerId == null ? Set.of() : Set.copyOf(repository.blockedEitherWay(viewerId));
    }

    /** Deletes every block involving the account (account deletion). */
    @Transactional
    public int purge(UUID userId) {
        return repository.deleteAllOf(userId);
    }
}
