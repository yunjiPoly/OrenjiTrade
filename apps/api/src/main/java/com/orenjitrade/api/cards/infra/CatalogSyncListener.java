package com.orenjitrade.api.cards.infra;

import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.cards.events.CatalogSyncRequestedEvent;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Runs queued catalog syncs after the requesting transaction committed (Spring Modulith event
 * publication registry: an interrupted run is republished on restart). Idempotent: {@link
 * CatalogImportService#execute} only starts QUEUED runs.
 */
@Component
public class CatalogSyncListener {

    private final CatalogImportService importService;

    public CatalogSyncListener(CatalogImportService importService) {
        this.importService = importService;
    }

    @ApplicationModuleListener
    void on(CatalogSyncRequestedEvent event) {
        importService.execute(event.runId());
    }
}
