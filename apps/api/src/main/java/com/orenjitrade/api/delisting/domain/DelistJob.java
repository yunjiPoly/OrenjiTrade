package com.orenjitrade.api.delisting.domain;

import com.orenjitrade.api.jobs.domain.JobRunService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * The daily {@code delist} job (Phase 3 contract "Jobs"): pauses the public listings of owners
 * whose unresponsiveness strikes reached {@code delist_policy.max_strikes}. Strike tracking arrives
 * with Phases 5/7 ({@code user_responsiveness}); until then the job records a run and pauses
 * nobody. Never deletes anything.
 */
@Component
public class DelistJob {

    public static final String NAME = "delist";

    private final JobRunService jobRunService;
    private final DelistPolicyService policies;

    public DelistJob(JobRunService jobRunService, DelistPolicyService policies) {
        this.jobRunService = jobRunService;
        this.policies = policies;
    }

    public Result run() {
        Map<String, ?> details =
                jobRunService.run(
                        NAME,
                        () -> {
                            Map<String, Object> result = new LinkedHashMap<>();
                            result.put("maxStrikes", policies.active().maxStrikes());
                            result.put("ownersEvaluated", 0);
                            result.put("listingsPaused", 0);
                            result.put("strikeTracking", false);
                            return result;
                        });
        return new Result(
                ((Number) details.get("ownersEvaluated")).intValue(),
                ((Number) details.get("listingsPaused")).intValue());
    }

    /**
     * Outcome of one run.
     *
     * @param ownersEvaluated owners whose strikes were checked
     * @param listingsPaused owners whose public listings were paused
     */
    public record Result(int ownersEvaluated, int listingsPaused) {}
}
