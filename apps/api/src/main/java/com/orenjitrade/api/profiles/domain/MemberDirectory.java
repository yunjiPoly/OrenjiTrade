package com.orenjitrade.api.profiles.domain;

import com.orenjitrade.api.common.storage.ObjectStorage;
import com.orenjitrade.api.profiles.infra.MemberCardRepository;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Member cards in batches (Phase 5: conversation lists, message senders, community authors): one
 * query for a whole page instead of one per member. Avatar URLs are resolved per request.
 */
@Service
public class MemberDirectory {

    private final MemberCardRepository repository;
    private final ObjectStorage storage;

    public MemberDirectory(MemberCardRepository repository, ObjectStorage storage) {
        this.repository = repository;
        this.storage = storage;
    }

    /** Cards of the given accounts by id; unknown ids are absent. */
    @Transactional(readOnly = true)
    public Map<UUID, MemberCard> cards(Collection<UUID> ids) {
        Map<UUID, MemberCard> result = new LinkedHashMap<>();
        for (MemberCardRepository.Row row : repository.find(ids)) {
            result.put(
                    row.id(),
                    new MemberCard(
                            row.id(),
                            row.handle(),
                            row.displayName(),
                            row.avatarKey() == null ? null : storage.publicUrl(row.avatarKey()),
                            row.status(),
                            row.suspendedUntil(),
                            row.privacy(),
                            row.profileComplete()));
        }
        return result;
    }

    /** The card of one account. */
    @Transactional(readOnly = true)
    public Optional<MemberCard> card(UUID id) {
        return Optional.ofNullable(cards(java.util.List.of(id)).get(id));
    }
}
