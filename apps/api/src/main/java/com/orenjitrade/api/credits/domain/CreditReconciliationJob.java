package com.orenjitrade.api.credits.domain;

import com.orenjitrade.api.credits.domain.CreditRows.BalanceCheck;
import com.orenjitrade.api.credits.infra.CreditBalanceCache;
import com.orenjitrade.api.credits.infra.CreditLedgerRepository;
import com.orenjitrade.api.jobs.domain.JobRunService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * The {@code credits-reconcile} job ({@code POST /internal/jobs/credits-reconcile}, hourly under
 * {@code local}): for every account holding credits, compares the cached balance with {@code
 * SUM(amount)} of the ledger and repairs the cache; also checks that the running balance of the
 * latest entry equals the sum (a mismatch would mean a write outside the ledger lock and is logged
 * at ERROR with the {@code credits.ledger.mismatch} marker; the ledger is never edited).
 */
@Service
public class CreditReconciliationJob {

    public static final String NAME = "credits-reconcile";

    static final int PAGE = 500;
    static final String MISMATCH_MARKER = "credits.ledger.mismatch";

    private static final Logger log = LoggerFactory.getLogger(CreditReconciliationJob.class);

    private final CreditLedgerRepository repository;
    private final CreditBalanceCache cache;
    private final JobRunService jobRuns;

    public CreditReconciliationJob(
            CreditLedgerRepository repository, CreditBalanceCache cache, JobRunService jobRuns) {
        this.repository = repository;
        this.cache = cache;
        this.jobRuns = jobRuns;
    }

    /** Runs the job; the details are {@code {accounts, cacheMismatches, ledgerMismatches}}. */
    public Map<String, ?> run() {
        return jobRuns.run(NAME, this::work);
    }

    private Map<String, ?> work() {
        int accounts = 0;
        int cacheMismatches = 0;
        int ledgerMismatches = 0;
        @Nullable UUID after = null;
        while (true) {
            List<BalanceCheck> page = repository.balanceChecks(PAGE, after);
            for (BalanceCheck check : page) {
                accounts++;
                OptionalLong cached = cache.get(check.userId());
                if (cached.isPresent() && cached.getAsLong() != check.balance()) {
                    cacheMismatches++;
                    cache.put(check.userId(), check.balance());
                }
                if (check.latestBalanceAfter() != check.balance()) {
                    ledgerMismatches++;
                    log.atError()
                            .addKeyValue("event", MISMATCH_MARKER)
                            .log(
                                    MISMATCH_MARKER
                                            + ": account {} sums to {} but its latest entry"
                                            + " records {}",
                                    check.userId(),
                                    check.balance(),
                                    check.latestBalanceAfter());
                }
            }
            if (page.size() < PAGE) {
                break;
            }
            after = page.get(page.size() - 1).userId();
        }
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("accounts", accounts);
        details.put("cacheMismatches", cacheMismatches);
        details.put("ledgerMismatches", ledgerMismatches);
        return details;
    }
}
