/**
 * Jobs module.
 *
 * <p>Execution records of internal jobs ({@code job_run}) and the {@code /internal/jobs/**}
 * triggers used by Cloud Scheduler and Pub/Sub push subscriptions. Business jobs live in their own
 * modules and use {@link com.orenjitrade.api.jobs.domain.JobRunService} to record runs.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Jobs")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.jobs;
