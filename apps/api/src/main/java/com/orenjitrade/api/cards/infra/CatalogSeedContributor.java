package com.orenjitrade.api.cards.infra;

import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.cards.domain.SyncRunStatus;
import com.orenjitrade.api.cards.domain.SyncRunView;
import com.orenjitrade.api.cards.domain.provider.SyncMode;
import com.orenjitrade.api.common.seed.SeedContributor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * Imports the fictional {@link MockCardProvider} catalog of every game at start-up (seed runner,
 * {@code local} and {@code dev}). Idempotent: an unchanged fixture upserts nothing; each import is
 * recorded as a {@code catalog_sync_run}. Does nothing when the mock provider is not active.
 */
@Component
public class CatalogSeedContributor implements SeedContributor {

    private static final Logger log = LoggerFactory.getLogger(CatalogSeedContributor.class);

    private final CatalogImportService importService;
    private final ObjectProvider<MockCardProvider> mockProvider;

    public CatalogSeedContributor(
            CatalogImportService importService, ObjectProvider<MockCardProvider> mockProvider) {
        this.importService = importService;
        this.mockProvider = mockProvider;
    }

    @Override
    public String name() {
        return "catalog";
    }

    @Override
    public int order() {
        return ORDER_CATALOG;
    }

    @Override
    public void seed() {
        if (mockProvider.getIfAvailable() == null) {
            log.info("Mock card provider not active; catalog seed skipped");
            return;
        }
        for (String game : MockCardProvider.GAMES) {
            SyncRunView run =
                    importService.importNow(MockCardProvider.PROVIDER_ID, game, SyncMode.FULL);
            if (run.status() != SyncRunStatus.SUCCEEDED) {
                throw new IllegalStateException("Catalog seed failed for " + game);
            }
        }
    }
}
