package com.orenjitrade.api.credits.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.credits.api.CreditRequests.RedeemRequest;
import com.orenjitrade.api.credits.api.CreditRequests.SpendRequest;
import com.orenjitrade.api.credits.api.CreditResponses.CreditEntryResponse;
import com.orenjitrade.api.credits.api.CreditResponses.CreditProductResponse;
import com.orenjitrade.api.credits.api.CreditResponses.MyCreditsResponse;
import com.orenjitrade.api.credits.api.CreditResponses.RedeemResponse;
import com.orenjitrade.api.credits.api.CreditResponses.ReferralResponse;
import com.orenjitrade.api.credits.api.CreditResponses.SpendResponse;
import com.orenjitrade.api.credits.domain.CreditLedger;
import com.orenjitrade.api.credits.domain.CreditProducts;
import com.orenjitrade.api.credits.domain.CreditRows.CreditEntry;
import com.orenjitrade.api.credits.domain.ReferralService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code /api/v1/me/credits} and {@code /api/v1/me/referrals} (Phase 10 contract "OriEnji credits";
 * feature flag {@code credits}: 404 FEATURE_DISABLED when off). Credits are non-cash: never bought,
 * withdrawn or transferred here; they are earned, granted and spent on time-boxed entitlements.
 */
@RestController
@Validated
@Tag(name = "credits", description = "OriEnji credits (non-cash) and referral codes")
public class CreditsController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final CreditLedger ledger;
    private final CreditProducts products;
    private final ReferralService referrals;
    private final JsonMapper jsonMapper;

    public CreditsController(
            CreditLedger ledger,
            CreditProducts products,
            ReferralService referrals,
            JsonMapper jsonMapper) {
        this.ledger = ledger;
        this.products = products;
        this.referrals = referrals;
        this.jsonMapper = jsonMapper;
    }

    @GetMapping(path = "/api/v1/me/credits", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getMyCredits",
            summary = "The caller's credit balance, ledger and products",
            description =
                    "balance = SUM of the append-only ledger; entries newest first (cursor"
                            + " pagination); products are what credits unlock. Credits are"
                            + " non-cash: never withdrawable or transferable. 404"
                            + " FEATURE_DISABLED while the credits flag is off.")
    @ApiResponse(responseCode = "200", description = "The credits")
    @ApiResponse(
            responseCode = "404",
            description = "FEATURE_DISABLED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public MyCreditsResponse credits(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Parameter(description = "Opaque cursor of the next slice")
                    @RequestParam(required = false)
                    @Size(max = 200)
                    @Nullable String cursor,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int limit) {
        ledger.requireEnabled(principal.userId());
        CursorPage<CreditEntry> page = ledger.entries(principal.userId(), cursor, limit);
        return new MyCreditsResponse(
                ledger.balance(principal.userId()),
                new CursorPage<>(
                        page.items().stream()
                                .map(entry -> CreditEntryResponse.from(entry, jsonMapper))
                                .toList(),
                        page.nextCursor(),
                        page.hasMore()),
                products.active().stream().map(CreditProductResponse::from).toList(),
                false,
                false);
    }

    @PostMapping(
            path = "/api/v1/me/credits/spend",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "spendCredits",
            summary = "Spend credits on a time-boxed feature",
            description =
                    "Buys the credit product featureKey (e.g. premium_search_day) for its cost: a"
                        + " SPEND entry and a CREDIT_PURCHASE entitlement for durationHours"
                        + " (stacked after an active one of the same feature). Idempotent per"
                        + " idempotencyKey: a retry returns the original result (duplicate=true)"
                        + " without spending again; the same key for another product is 409"
                        + " CONFLICT. 409 INSUFFICIENT_CREDITS (extensions balance, cost); 404"
                        + " FEATURE_DISABLED while the credits flag is off.")
    @ApiResponse(responseCode = "200", description = "What was unlocked")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (unknown or inactive product)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "FEATURE_DISABLED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "INSUFFICIENT_CREDITS, CONFLICT (key reused for another product)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public SpendResponse spend(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody SpendRequest body) {
        return SpendResponse.from(
                ledger.spend(principal, body.featureKey(), body.idempotencyKey()), jsonMapper);
    }

    @GetMapping(path = "/api/v1/me/referrals", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getMyReferral",
            summary = "The caller's referral code and rewards",
            description =
                    "Creates the caller's code on first request. redeemBefore is the end of the"
                            + " caller's own redemption window (credits.referral_max_account_age_"
                            + "days after sign-up). 404 FEATURE_DISABLED while credits is off.")
    @ApiResponse(responseCode = "200", description = "The referral state")
    @ApiResponse(
            responseCode = "404",
            description = "FEATURE_DISABLED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ReferralResponse referral(@AuthenticationPrincipal AuthenticatedUser principal) {
        return ReferralResponse.from(referrals.mine(principal.userId()));
    }

    @PostMapping(
            path = "/api/v1/me/referrals/redeem",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "redeemReferralCode",
            summary = "Redeem another collector's referral code",
            description =
                    "Once per account, within credits.referral_max_account_age_days of sign-up:"
                        + " both parties earn credits (EARN, REFERRAL). 404 for unknown codes; 409"
                        + " REFERRAL_NOT_ALLOWED with reason SELF, ALREADY_REDEEMED,"
                        + " ACCOUNT_TOO_OLD or REFERRER_LIMIT; 404 FEATURE_DISABLED while credits"
                        + " is off.")
    @ApiResponse(responseCode = "200", description = "The redemption")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND, FEATURE_DISABLED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "REFERRAL_NOT_ALLOWED (extension reason)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public RedeemResponse redeem(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody RedeemRequest body) {
        return RedeemResponse.from(referrals.redeem(principal, body.code()));
    }
}
