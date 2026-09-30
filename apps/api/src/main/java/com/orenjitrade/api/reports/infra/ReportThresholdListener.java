package com.orenjitrade.api.reports.infra;

import com.orenjitrade.api.reports.domain.ReportThresholdService;
import com.orenjitrade.api.reports.events.CollectorReported;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Checks the report threshold after every committed report ({@link CollectorReported}, Spring
 * Modulith registry: own transaction, retried after a crash). Idempotent.
 */
@Component
public class ReportThresholdListener {

    private final ReportThresholdService threshold;

    public ReportThresholdListener(ReportThresholdService threshold) {
        this.threshold = threshold;
    }

    @ApplicationModuleListener
    void on(CollectorReported event) {
        threshold.evaluate(event.reportedUserId());
    }
}
