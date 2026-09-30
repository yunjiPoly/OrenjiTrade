package com.orenjitrade.api.offers.domain;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.offers.infra.OfferPreferencesRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A collector's offer settings ({@code GET/PUT /me/settings/offers}): whether MIXED offers are
 * welcome on their TRADE_OR_SALE cards (the contract's {@code accepts_mixed}, default true).
 */
@Service
public class OfferPreferencesService {

    private final OfferPreferencesRepository repository;
    private final TimeProvider timeProvider;

    public OfferPreferencesService(
            OfferPreferencesRepository repository, TimeProvider timeProvider) {
        this.repository = repository;
        this.timeProvider = timeProvider;
    }

    @Transactional(readOnly = true)
    public boolean acceptsMixed(UUID userId) {
        return repository.acceptsMixed(userId).orElse(true);
    }

    @Transactional
    public boolean update(UUID userId, boolean acceptsMixed) {
        repository.upsert(userId, acceptsMixed, timeProvider.now());
        return acceptsMixed;
    }

    @Transactional
    public void purge(UUID userId) {
        repository.delete(userId);
    }
}
