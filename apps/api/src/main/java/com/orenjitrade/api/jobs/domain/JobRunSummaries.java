package com.orenjitrade.api.jobs.domain;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read model of {@code job_run} for the admin console "System Health" (Phase 7): the latest run of
 * every job name with the last success and the failures since a given time.
 */
@Service
public class JobRunSummaries {

    private final JdbcClient jdbc;

    public JobRunSummaries(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** One summary per job name that ever ran, by name. */
    @Transactional(readOnly = true)
    public List<JobSummary> latest(Instant failuresSince) {
        return jdbc.sql(
                        """
                        SELECT latest.name, latest.status, latest.started_at, latest.finished_at,
                               (SELECT max(s.finished_at) FROM job_run s
                                 WHERE s.name = latest.name AND s.status = 'SUCCEEDED')
                                   AS last_succeeded_at,
                               (SELECT count(*) FROM job_run f
                                 WHERE f.name = latest.name AND f.status = 'FAILED'
                                   AND f.started_at >= :since) AS recent_failures
                          FROM (SELECT DISTINCT ON (name) name, status, started_at, finished_at
                                  FROM job_run ORDER BY name, started_at DESC) latest
                         ORDER BY latest.name
                        """)
                .param("since", Timestamp.from(failuresSince))
                .query(
                        (rs, rowNum) ->
                                new JobSummary(
                                        rs.getString("name"),
                                        JobRunStatus.valueOf(rs.getString("status")),
                                        rs.getTimestamp("started_at").toInstant(),
                                        instant(rs.getTimestamp("finished_at")),
                                        instant(rs.getTimestamp("last_succeeded_at")),
                                        rs.getInt("recent_failures")))
                .list();
    }

    private static @Nullable Instant instant(@Nullable Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    /**
     * The state of one job.
     *
     * @param name job name
     * @param lastStatus status of the latest run
     * @param lastStartedAt start of the latest run
     * @param lastFinishedAt end of the latest run ({@code null} while running)
     * @param lastSucceededAt end of the latest successful run
     * @param recentFailures failed runs since the requested time
     */
    public record JobSummary(
            String name,
            JobRunStatus lastStatus,
            Instant lastStartedAt,
            @Nullable Instant lastFinishedAt,
            @Nullable Instant lastSucceededAt,
            int recentFailures) {}
}
