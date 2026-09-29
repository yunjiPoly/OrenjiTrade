package com.orenjitrade.api.users.infra;

import com.orenjitrade.api.users.domain.AccountDeletionRequest;
import com.orenjitrade.api.users.domain.DeletionRequestStatus;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Repository of {@link AccountDeletionRequest}; used only inside the users module. */
public interface AccountDeletionRequestRepository
        extends JpaRepository<AccountDeletionRequest, UUID> {

    List<AccountDeletionRequest> findByUserIdOrderByRequestedAtDesc(UUID userId);

    Optional<AccountDeletionRequest> findFirstByUserIdAndStatusIn(
            UUID userId, Collection<DeletionRequestStatus> statuses);

    boolean existsByUserIdAndStatusIn(UUID userId, Collection<DeletionRequestStatus> statuses);

    /** Owner-scoped lookup with a row lock (cancellation races the deletion job). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<AccountDeletionRequest> findByIdAndUserId(UUID id, UUID userId);

    @Query(
            "select r.id from AccountDeletionRequest r where r.status = :status"
                    + " and r.scheduledFor <= :now order by r.scheduledFor asc")
    List<UUID> findDueIds(
            @Param("status") DeletionRequestStatus status, @Param("now") Instant now, Limit limit);

    /**
     * Locks one due request for processing; empty when it was cancelled, is not due or another
     * instance is processing it ({@code SKIP LOCKED}).
     */
    @Query(
            value =
                    "SELECT * FROM account_deletion_request WHERE id = :id AND status = 'PENDING'"
                            + " AND scheduled_for <= :now FOR UPDATE SKIP LOCKED",
            nativeQuery = true)
    Optional<AccountDeletionRequest> lockDue(@Param("id") UUID id, @Param("now") Instant now);
}
