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

    interface HandleProjection {
        UUID getId();

        String getHandle();
    }
}
