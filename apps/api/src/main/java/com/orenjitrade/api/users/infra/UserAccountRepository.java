package com.orenjitrade.api.users.infra;

import com.orenjitrade.api.users.domain.UserAccount;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserAccountRepository
        extends JpaRepository<UserAccount, UUID>, JpaSpecificationExecutor<UserAccount> {

    @EntityGraph(attributePaths = "roles")
    Optional<UserAccount> findWithRolesByProviderUid(String providerUid);

    @EntityGraph(attributePaths = "roles")
    Optional<UserAccount> findWithRolesById(UUID id);

    @EntityGraph(attributePaths = "roles")
    List<UserAccount> findWithRolesByIdIn(Collection<UUID> ids);

    boolean existsByHandleIgnoreCase(String handle);

    boolean existsByHandleIgnoreCaseAndIdNot(String handle, UUID id);

    @EntityGraph(attributePaths = "roles")
    Optional<UserAccount> findWithRolesByHandleIgnoreCase(String handle);

    /** Cheap projection for audit actors. */
    @Query("select u.id as id, u.handle as handle from UserAccount u where u.id in :ids")
    List<HandleProjection> findHandlesByIdIn(@Param("ids") Collection<UUID> ids);

    /** Cheap projection for plan resolution (billing module, through the service). */
    @Query("select u.planCode from UserAccount u where u.id = :id")
    Optional<String> findPlanCodeById(@Param("id") UUID id);

    @Modifying
    @Query(
            "update UserAccount u set u.lastActiveAt = :now where u.id = :id and u.deletedAt is"
                    + " null")
    int touchLastActive(@Param("id") UUID id, @Param("now") Instant now);

    /**
     * Ids of accounts able to receive notices (ACTIVE, or SUSPENDED with an elapsed end), oldest
     * first; with {@code staffOnly} only those holding MODERATOR, ADMIN or SUPER_ADMIN.
     */
    @Query(
            value =
                    "SELECT u.id FROM user_account u WHERE (u.status = 'ACTIVE' OR (u.status ="
                            + " 'SUSPENDED' AND u.suspended_until IS NOT NULL AND"
                            + " u.suspended_until <= :now)) AND (:staffOnly = false OR EXISTS"
                            + " (SELECT 1 FROM user_role r WHERE r.user_id = u.id AND r.role IN"
                            + " ('MODERATOR', 'ADMIN', 'SUPER_ADMIN'))) ORDER BY u.created_at, u.id"
                            + " LIMIT :limit OFFSET :offset",
            nativeQuery = true)
    List<UUID> findReachableIds(
            @Param("now") Instant now,
            @Param("staffOnly") boolean staffOnly,
            @Param("limit") int limit,
            @Param("offset") long offset);

    interface HandleProjection {
        UUID getId();

        String getHandle();
    }
}
