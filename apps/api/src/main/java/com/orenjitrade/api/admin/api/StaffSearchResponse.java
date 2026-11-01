package com.orenjitrade.api.admin.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.admin.infra.StaffSearchRepository.CardHit;
import com.orenjitrade.api.admin.infra.StaffSearchRepository.CollectorHit;
import com.orenjitrade.api.admin.infra.StaffSearchRepository.ReportHit;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * {@code GET /api/v1/admin/search}: the console's staff search, grouped Collectors, Cards and
 * Reports (spec 15.8.6). People as handle, name and email, never a place.
 */
@Schema(name = "StaffSearchResponse", description = "The admin console's staff search")
public record StaffSearchResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED) List<Collector> collectors,
        @Schema(requiredMode = RequiredMode.REQUIRED) List<Card> cards,
        @Schema(requiredMode = RequiredMode.REQUIRED) List<Report> reports) {

    /** An account: handle, name, email and status. */
    @Schema(name = "StaffSearchCollector")
    public record Collector(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String handle,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String displayName,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String email,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "ACTIVE") String status) {

        static Collector from(CollectorHit hit) {
            return new Collector(
                    hit.id(), hit.handle(), hit.displayName(), hit.email(), hit.status());
        }
    }

    /** A card, with the printing code that matched (if any). */
    @Schema(name = "StaffSearchCard")
    public record Card(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String name,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "yugioh") String game,
            @Schema(nullable = true, example = "LOB-EN005") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String printingCode) {

        static Card from(CardHit hit) {
            return new Card(hit.id(), hit.name(), hit.game(), hit.printingCode());
        }
    }

    /** A report found by its number. */
    @Schema(name = "StaffSearchReport")
    public record Report(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "1047") long number,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "SCAM") String reason,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "OPEN") String status,
            @Schema(requiredMode = RequiredMode.REQUIRED) String reportedHandle) {

        static Report from(ReportHit hit) {
            return new Report(
                    hit.id(), hit.number(), hit.reason(), hit.status(), hit.reportedHandle());
        }
    }
}
