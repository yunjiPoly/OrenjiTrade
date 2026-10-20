package com.orenjitrade.api.cards.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.cards.domain.scan.CardMatcher;
import com.orenjitrade.api.cards.domain.scan.ScanMatch;
import com.orenjitrade.api.cards.domain.scan.ScanQuery;
import com.orenjitrade.api.featureflags.domain.FeatureFlagKeys;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /api/v1/cards/scan-match}: the card a camera scan read (owner spec 2026-10-15,
 * section 3.5). The phone reads the name and the set code on the device and sends only that text;
 * the photo never leaves the phone. A POST, so the read text stays out of addresses and access
 * logs. Signed-in collectors only; the flag {@code cardTextScan} switches it off.
 */
@RestController
@Validated
@Tag(name = "card-scan", description = "Scan with camera: match the text read on a card")
public class CardScanController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final CardMatcher matcher;
    private final FeatureFlags featureFlags;

    public CardScanController(CardMatcher matcher, FeatureFlags featureFlags) {
        this.matcher = matcher;
        this.featureFlags = featureFlags;
    }

    /**
     * The text read on one photo, best first.
     *
     * @param game the game read; only {@code yugioh}
     * @param codes 0 to 3 printing code candidates as read (the server cleans them again)
     * @param names 0 to 3 name candidates as read
     */
    @Schema(name = "CardScanMatchRequest", description = "What the phone read on one card")
    public record CardScanMatchRequest(
            @Schema(example = "yugioh") @NotBlank @Size(max = 32) String game,
            @Schema(description = "0 to 3 printing codes as read, best first")
                    @Nullable
                    @Size(max = 3)
                    List<@NotNull @Size(max = 40) String> codes,
            @Schema(description = "0 to 3 card names as read, best first") @Nullable @Size(max = 3)
                    List<@NotNull @Size(max = 150) String> names) {}

    @PostMapping(
            path = "/api/v1/cards/scan-match",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "matchScannedCard",
            summary = "Find the card a scan read",
            description =
                    "Yu-Gi-Oh! English cards only. The codes are tried as read, in the other form"
                        + " of an old code (LOB-005 / LOB-EN005, LOB-E001 → LOB-EN001), with a"
                        + " missing dash at each place, then with look-alike characters (O/0, D/0,"
                        + " I/1, L/1, S/5, B/8, Z/2, G/6) only when the catalog has the result; the"
                        + " names as /cards/suggest finds them. FOUND: one card and one printing;"
                        + " PICK_RARITY: the code comes in several rarities (`rarities`);"
                        + " PICK_PRINTING: the card is known, not its printing (`printings`, newest"
                        + " set first); NOT_FOUND (`reason`). A code with another language's region"
                        + " (MACR-FR036) is NOT_FOUND whatever the name says. `otherMatches`: at"
                        + " most 6 other cards (look-alike codes, also 3/8, 6/8, 5/6, 0/8 and 1/7,"
                        + " then close names). Pictures are this API's card-images addresses. 404"
                        + " FEATURE_DISABLED while the flag cardTextScan is off.")
    @ApiResponse(responseCode = "200", description = "The match")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (another game than yugioh, a bad body)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "FEATURE_DISABLED (cardTextScan is off)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ScanMatch match(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody CardScanMatchRequest body) {
        featureFlags.require(FeatureFlagKeys.CARD_TEXT_SCAN, principal.userId());
        return matcher.match(
                new ScanQuery(
                        body.game(),
                        body.codes() == null ? List.of() : body.codes(),
                        body.names() == null ? List.of() : body.names()));
    }
}
