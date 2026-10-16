package com.orenjitrade.api.ratings.domain;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.ratings.infra.InteractionRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The ratings module's service interface for interactions (Phase 7 contract): what makes two
 * collectors eligible to rate each other. {@link #record} is idempotent per kind and subject
 * (unique {@code (kind, subject_id)}), so callers may repeat it safely; Phase 8 records {@link
 * InteractionKind#OFFER_ACCEPTED} and {@link InteractionKind#TRADE}, this module records {@link
 * InteractionKind#CONVERSATION_QUALIFIED} from the messaging module's events ({@link
 * #QUALIFYING_MESSAGES_PER_SIDE} messages from each side), and the deals module records {@link
 * InteractionKind#SALE} for each sale (stage R4) and removes it on an undo while it is unrated
 * ({@link #removeIfUnrated}).
 */
@Service
public class InteractionService {

    /** Messages each participant must have sent for a conversation to qualify. */
    public static final int QUALIFYING_MESSAGES_PER_SIDE = 3;

    private static final Logger log = LoggerFactory.getLogger(InteractionService.class);

    private final InteractionRepository repository;
    private final TimeProvider timeProvider;

    public InteractionService(InteractionRepository repository, TimeProvider timeProvider) {
        this.repository = repository;
        this.timeProvider = timeProvider;
    }

    /**
     * Records an interaction between two different accounts now (see {@link
     * #record(InteractionKind, UUID, UUID, InteractionSubjectType, UUID, Instant)}).
     */
    @Transactional
    public InteractionView record(
            InteractionKind kind,
            UUID userA,
            UUID userB,
            InteractionSubjectType subjectType,
            UUID subjectId) {
        return record(kind, userA, userB, subjectType, subjectId, timeProvider.now());
    }

    /**
     * Records an interaction between two different accounts (in any order). Joins the caller's
     * transaction. A second call for the same kind and subject returns the existing interaction.
     *
     * @throws IllegalArgumentException when both users are the same or the subject type does not
     *     match the kind
     */
    @Transactional
    public InteractionView record(
            InteractionKind kind,
            UUID userA,
            UUID userB,
            InteractionSubjectType subjectType,
            UUID subjectId,
            Instant occurredAt) {
        if (userA.equals(userB)) {
            throw new IllegalArgumentException("An interaction needs two different accounts");
        }
        if (kind.subjectType() != subjectType) {
            throw new IllegalArgumentException(
                    kind + " interactions point at " + kind.subjectType());
        }
        boolean inserted =
                repository.insertIfAbsent(
                        UUID.randomUUID(),
                        kind,
                        userA,
                        userB,
                        subjectType,
                        subjectId,
                        occurredAt.truncatedTo(ChronoUnit.MICROS));
        if (inserted) {
            log.info("Interaction {} recorded for subject {}", kind, subjectId);
        }
        return repository
                .findBySubject(kind, subjectId)
                .orElseThrow(() -> new IllegalStateException("Interaction vanished: " + subjectId));
    }

    /**
     * Removes the interaction of a kind and subject while nobody has rated it (the undo of a sale,
     * stage R4). It locks the interaction first: a rating in progress finishes before the check,
     * and a rating that starts afterwards waits and then finds the interaction gone ({@link
     * #findForRating}). Joins the caller's transaction.
     *
     * @return {@link Removal#REMOVED}, {@link Removal#RATED} (kept: somebody rated it) or {@link
     *     Removal#ABSENT}
     */
    @Transactional
    public Removal removeIfUnrated(InteractionKind kind, UUID subjectId) {
        Optional<InteractionView> found = repository.lockBySubjectForRemoval(kind, subjectId);
        if (found.isEmpty()) {
            return Removal.ABSENT;
        }
        if (repository.isRated(found.get().id())) {
            return Removal.RATED;
        }
        repository.delete(found.get().id());
        log.info("Interaction {} removed for subject {}", kind, subjectId);
        return Removal.REMOVED;
    }

    /**
     * The interaction a rating is about, held {@code FOR KEY SHARE} until the rating's transaction
     * ends, so the undo of a sale ({@link #removeIfUnrated}) cannot remove it in between.
     */
    @Transactional
    public Optional<InteractionView> findForRating(UUID id) {
        return repository.findLockedShared(id);
    }

    /** Outcome of {@link #removeIfUnrated}. */
    public enum Removal {
        REMOVED,
        RATED,
        ABSENT
    }

    /** Whether an interaction of {@code kind} exists for the subject. */
    @Transactional(readOnly = true)
    public boolean exists(InteractionKind kind, UUID subjectId) {
        return repository.findBySubject(kind, subjectId).isPresent();
    }

    /** Interactions between two accounts, newest first (empty for the same account). */
    @Transactional(readOnly = true)
    public List<InteractionView> between(UUID one, UUID other) {
        if (one.equals(other)) {
            return List.of();
        }
        return repository.between(one, other);
    }

    @Transactional(readOnly = true)
    public Optional<InteractionView> find(UUID id) {
        return repository.find(id);
    }

    /**
     * Whether messages per sender qualify a conversation between {@code a} and {@code b}: both sent
     * at least {@link #QUALIFYING_MESSAGES_PER_SIDE} (pure).
     */
    public static boolean qualifies(Map<UUID, Long> countsBySender, UUID a, UUID b) {
        return countsBySender.getOrDefault(a, 0L) >= QUALIFYING_MESSAGES_PER_SIDE
                && countsBySender.getOrDefault(b, 0L) >= QUALIFYING_MESSAGES_PER_SIDE;
    }
}
