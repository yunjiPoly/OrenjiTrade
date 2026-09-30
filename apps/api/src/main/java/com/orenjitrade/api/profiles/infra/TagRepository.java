package com.orenjitrade.api.profiles.infra;

import com.orenjitrade.api.profiles.domain.Tag;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Repository of {@link Tag}; used only inside the profiles module. */
public interface TagRepository extends JpaRepository<Tag, UUID> {

    Optional<Tag> findBySlug(String slug);

    /**
     * Recomputes {@code usage_count} of the given tags from {@code profile_tag}. Flushes pending
     * profile changes first. Tag entities already loaded keep their old count (the persistence
     * context is deliberately not cleared: callers may hold other managed entities); read fresh
     * counts through {@link TagSearchRepository#findViews}.
     */
    @Modifying(flushAutomatically = true)
    @Query(
            value =
                    "UPDATE tag t SET usage_count = (SELECT count(*) FROM profile_tag pt WHERE"
                            + " pt.tag_id = t.id), updated_at = now() WHERE t.id IN (:ids)",
            nativeQuery = true)
    int recountUsage(@Param("ids") Collection<UUID> ids);
}
