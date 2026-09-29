package com.orenjitrade.api.jobs.domain;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.jobs.infra.JobRunRepository;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * Records internal job executions in {@code job_run}. Later jobs (account deletion, auto-delist,
 * wishlist matching) wrap their work in {@link #run(String, Supplier)}.
 *
 * <p>The start and end rows are written in their own {@code REQUIRES_NEW} transactions (explicit
 * {@link TransactionTemplate}, so the calls from {@link #run} are not subject to proxy
 * self-invocation), which leaves a {@code FAILED} record even when the job's own transaction rolls
 * back.
 */
@Service
public class JobRunService {

    private static final Logger log = LoggerFactory.getLogger(JobRunService.class);

    private final JobRunRepository repository;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;
    private final TransactionTemplate newTransaction;

    public JobRunService(
            JobRunRepository repository,
            TimeProvider timeProvider,
            JsonMapper jsonMapper,
            PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
        this.newTransaction = new TransactionTemplate(transactionManager);
        this.newTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * Executes {@code work} and records the outcome.
     *
     * @return the details the job produced
     */
    public Map<String, ?> run(String name, Supplier<Map<String, ?>> work) {
        UUID runId = start(name);
        try {
            Map<String, ?> details = work.get();
            finish(runId, true, details);
            return details;
        } catch (RuntimeException e) {
            log.error("Job {} failed (run {})", name, runId, e);
            finish(runId, false, Map.of("error", e.getClass().getSimpleName()));
            throw e;
        }
    }

    /** Writes a {@code RUNNING} row in its own transaction and returns its id. */
    public UUID start(String name) {
        UUID id =
                newTransaction.execute(
                        status -> {
                            JobRun run = new JobRun(name, timeProvider.now());
                            repository.save(run);
                            return run.getId();
                        });
        if (id == null) {
            throw new IllegalStateException("Transaction returned no job run id");
        }
        return id;
    }

    /** Marks the run {@code SUCCEEDED} or {@code FAILED} in its own transaction. */
    public void finish(UUID runId, boolean succeeded, Map<String, ?> details) {
        newTransaction.executeWithoutResult(
                status -> {
                    JobRun run =
                            repository
                                    .findById(runId)
                                    .orElseThrow(
                                            () ->
                                                    new IllegalStateException(
                                                            "Unknown job run " + runId));
                    String json = details.isEmpty() ? null : jsonMapper.writeValueAsString(details);
                    if (succeeded) {
                        run.succeed(timeProvider.now(), json);
                    } else {
                        run.fail(timeProvider.now(), json);
                    }
                });
    }
}
