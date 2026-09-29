package com.orenjitrade.api.users.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.users.domain.DeletionRequestStatus;
import com.orenjitrade.api.users.domain.DeletionRequestView;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** An account deletion request of the caller. */
@Schema(name = "DeletionRequestResponse", description = "Account deletion request")
public record DeletionRequestResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "PENDING")
                DeletionRequestStatus status,
        @Schema(requiredMode = RequiredMode.REQUIRED, format = "date-time") Instant requestedAt,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        format = "date-time",
                        description = "End of the grace period (requestedAt + 7 days)")
                Instant scheduledFor,
        @Schema(nullable = true, format = "date-time") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant cancelledAt,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean exportRequested,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description = "Always empty on an accepted request (blocked ones are 409)")
                List<String> blockers) {

    static DeletionRequestResponse from(DeletionRequestView view) {
        return new DeletionRequestResponse(
                view.id(),
                view.status(),
                view.requestedAt(),
                view.scheduledFor(),
                view.cancelledAt(),
                view.exportRequested(),
                List.of());
    }
}
