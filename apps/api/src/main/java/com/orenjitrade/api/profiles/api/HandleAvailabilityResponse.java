package com.orenjitrade.api.profiles.api;

import com.orenjitrade.api.users.domain.HandleAvailability;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

/** Response of {@code GET /api/v1/me/profile/handle-availability} (stage R12). */
@Schema(name = "HandleAvailabilityResponse")
public record HandleAvailabilityResponse(
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        example = "sam_trades",
                        description = "The handle as it would be saved: trimmed and lower-cased")
                String handle,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description =
                                "AVAILABLE: free; CURRENT: the caller's own handle; TAKEN: held by"
                                    + " another account or reserved (a save answers 409"
                                    + " HANDLE_TAKEN); INVALID: not 3-24 characters [a-z0-9_] (a"
                                    + " save answers 400)")
                HandleAvailability status,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description = "Whether saving it would succeed (AVAILABLE or CURRENT)")
                boolean available) {

    static HandleAvailabilityResponse of(String handle, HandleAvailability status) {
        return new HandleAvailabilityResponse(handle, status, status.available());
    }
}
