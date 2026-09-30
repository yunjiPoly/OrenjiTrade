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
 * #QUALIFYING_MESSAGES_PER_SIDE} messages from each side).
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
