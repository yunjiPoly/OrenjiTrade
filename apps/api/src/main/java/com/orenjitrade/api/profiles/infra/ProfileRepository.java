package com.orenjitrade.api.profiles.infra;

import com.orenjitrade.api.profiles.domain.Profile;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Repository of {@link Profile}; used only inside the profiles module. */
public interface ProfileRepository extends JpaRepository<Profile, UUID> {

    @EntityGraph(attributePaths = "tags")
    Optional<Profile> findWithTagsByUserId(UUID userId);

    @Query("select p.avatarKey from Profile p where p.userId = :userId")
    Optional<String> findAvatarKey(@Param("userId") UUID userId);

    @Query("select (p.completedAt is not null) from Profile p where p.userId = :userId")
    Optional<Boolean> findCompleted(@Param("userId") UUID userId);

    @Query(
            value =
                    "SELECT (cardinality(p.games) > 0 OR EXISTS (SELECT 1 FROM profile_tag pt"
                            + " WHERE pt.profile_user_id = p.user_id)) FROM profile p WHERE"
                            + " p.user_id = :userId",
            nativeQuery = true)
    Optional<Boolean> findHasInterests(@Param("userId") UUID userId);
}
