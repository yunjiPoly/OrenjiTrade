package com.orenjitrade.api.users.api;

import com.orenjitrade.api.users.domain.AccountDeletionJob;
import com.orenjitrade.api.users.domain.AccountDeletionService.DeletionJobResult;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code POST /internal/jobs/account-deletion} (service token / Google OIDC). */
@RestController
@Tag(name = "internal", description = "Internal job triggers (service token / Google OIDC)")
public class AccountDeletionJobController {

    private final AccountDeletionJob job;

    public AccountDeletionJobController(AccountDeletionJob job) {
        this.job = job;
    }

    @PostMapping(
            path = "/internal/jobs/account-deletion",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "runAccountDeletionJob",
            summary = "Process due account deletions (service auth)",
            description =
                    "Anonymises every account whose grace period is over, purges module data,"
                            + " deletes the identity-provider user and records a job run. Consents,"
                            + " audit entries and ledgers are kept.")
    public AccountDeletionJobResponse run() {
        DeletionJobResult result = job.run();
        return new AccountDeletionJobResponse(
                result.processed(), result.skipped(), result.failed());
    }

    /** Response of {@code POST /internal/jobs/account-deletion}. */
    @Schema(name = "AccountDeletionJobResponse")
    public record AccountDeletionJobResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Accounts deleted")
                    int processed,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Due requests cancelled or taken meanwhile")
                    int skipped,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Requests left pending after an error")
                    int failed) {}
}
