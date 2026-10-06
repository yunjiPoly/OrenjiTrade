package com.orenjitrade.api.users.api;

import com.orenjitrade.api.users.domain.ConsentLanguage;
import com.orenjitrade.api.users.domain.LegalDocumentType;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/** Body of {@code POST /api/v1/me/consents}. */
@Schema(name = "ConsentRequest", description = "Acceptance of one legal document version")
public record ConsentRequest(
        @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull LegalDocumentType documentType,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "2026-09-01")
                @NotBlank
                @Size(max = 32)
                String version,
        @Schema(
                        requiredMode = RequiredMode.NOT_REQUIRED,
                        description =
                                "Language of the legal text shown to the collector (en or fr);"
                                        + " en when omitted. The version is the same in both"
                                        + " languages.",
                        example = "fr",
                        allowableValues = {"en", "fr"})
                @Pattern(regexp = ConsentLanguage.PATTERN)
                @Nullable String language) {

    /** Older clients send only the type and the version (English). */
    public ConsentRequest(LegalDocumentType documentType, String version) {
        this(documentType, version, null);
    }
}
