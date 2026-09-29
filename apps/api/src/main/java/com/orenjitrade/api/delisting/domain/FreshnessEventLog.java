package com.orenjitrade.api.delisting.domain;

import com.orenjitrade.api.delisting.infra.FreshnessEventRepository;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Append-only freshness audit trail ({@code inventory_freshness_event}): the binders and inventory
 * modules record every WARNED / AGED / STALED / HIDDEN / RESTORED transition here, in the same
 * transaction as the transition itself. Later phases de-duplicate notifications with it.
 */
@Service
public class FreshnessEventLog {

    private final FreshnessEventRepository repository;

    public FreshnessEventLog(FreshnessEventRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public void record(Collection<Entry> entries) {
        entries.forEach(repository::insert);
    }

    /** Event names recorded for an item or a binder, oldest first. */
    @Transactional(readOnly = true)
    public List<FreshnessEventType> eventsOf(UUID targetId) {
        return repository.eventsOf(targetId).stream().map(FreshnessEventType::valueOf).toList();
    }

    /**
     * One freshness event; exactly one of {@code itemId} and {@code binderId} is set.
     *
     * @param ownerId owner of the listing
     * @param itemId inventory item
     * @param binderId binder
     * @param type event
     * @param at when it happened
     */
    public record Entry(
            UUID ownerId,
            @Nullable UUID itemId,
            @Nullable UUID binderId,
            FreshnessEventType type,
            Instant at) {

        public Entry {
            if ((itemId == null) == (binderId == null)) {
                throw new IllegalArgumentException(
                        "Exactly one of itemId and binderId is required");
            }
        }

        public static Entry item(UUID ownerId, UUID itemId, FreshnessEventType type, Instant at) {
            return new Entry(ownerId, itemId, null, type, at);
        }

        public static Entry binder(
                UUID ownerId, UUID binderId, FreshnessEventType type, Instant at) {
            return new Entry(ownerId, null, binderId, type, at);
        }
    }
}
