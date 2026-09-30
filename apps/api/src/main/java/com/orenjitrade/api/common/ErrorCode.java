package com.orenjitrade.api.common;

import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

/**
 * Stable, client-facing error codes. Every RFC 9457 problem response carries exactly one of these
 * in its {@code errorCode} extension property so clients can branch on it instead of parsing
 * messages.
 *
 * <p>The enum is part of the public contract (it is rendered into the OpenAPI {@code ProblemDetail}
 * schema): add codes, never rename or remove them.
 */
public enum ErrorCode {
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "Validation failed"),
    NOT_FOUND(HttpStatus.NOT_FOUND, "Not found"),
    FORBIDDEN(HttpStatus.FORBIDDEN, "Forbidden"),
    UNAUTHENTICATED(HttpStatus.UNAUTHORIZED, "Unauthenticated"),
    /** The ID token is valid but too old for a sensitive operation (re-login required). */
    REAUTHENTICATION_REQUIRED(HttpStatus.UNAUTHORIZED, "Re-authentication required"),
    /** The account is suspended, pending deletion or deleted. */
    ACCOUNT_SUSPENDED(HttpStatus.FORBIDDEN, "Account suspended"),
    /**
     * A feature flag disables the requested capability. Rendered as 404 (the capability does not
     * exist for the caller), with the {@code feature} extension.
     */
    FEATURE_DISABLED(HttpStatus.NOT_FOUND, "Feature disabled"),
    /** The recipient does not accept messages from the caller (privacy settings or block). */
    MESSAGING_BLOCKED(HttpStatus.FORBIDDEN, "Messaging blocked"),
    /** A private message was rejected by the moderation rules (generic reason, Phase 5). */
    MESSAGE_BLOCKED(HttpStatus.UNPROCESSABLE_CONTENT, "Message blocked"),
    /** A community post or reply was rejected by the moderation rules (generic reason). */
    POST_BLOCKED(HttpStatus.UNPROCESSABLE_CONTENT, "Post blocked"),
    /** The author already posted the same text within the last 24 hours. */
    DUPLICATE_POST(HttpStatus.CONFLICT, "Duplicate post"),
    /**
     * The caller has no interaction (completed trade, accepted offer or qualified conversation)
     * with the collector they want to rate or write a reference for (Phase 7).
     */
    RATING_NOT_ELIGIBLE(HttpStatus.FORBIDDEN, "Rating not eligible"),
    /** The caller already rated this interaction (Phase 7); edit the existing rating instead. */
    ALREADY_RATED(HttpStatus.CONFLICT, "Already rated"),
    /** A rating can only be edited within 14 days of its creation (Phase 7). */
    RATING_EDIT_WINDOW_CLOSED(HttpStatus.CONFLICT, "Rating edit window closed"),
    /** The caller already has an open report against this collector (Phase 7). */
    REPORT_ALREADY_OPEN(HttpStatus.CONFLICT, "Report already open"),
    /** Collectors cannot report themselves (Phase 7). */
    CANNOT_REPORT_SELF(HttpStatus.UNPROCESSABLE_CONTENT, "Cannot report self"),
    /**
     * The listing does not accept this offer (Phase 8): offers are off for the item, the item is
     * NOT_AVAILABLE / COLLECTION_ONLY, or the kind does not fit its availability (cash for a
     * trade-only card, mixed offers the seller refuses).
     */
    OFFERS_NOT_ACCEPTED(HttpStatus.UNPROCESSABLE_CONTENT, "Offers not accepted"),
    /** The caller already negotiates an open offer on this item (Phase 8; extension offerId). */
    OFFER_ALREADY_OPEN(HttpStatus.CONFLICT, "Offer already open"),
    /**
     * The offer changed since the caller read it (Phase 8): another version, or a proposal that a
     * counter-offer replaced (extensions currentVersion / latestOfferId).
     */
    STALE_OFFER(HttpStatus.CONFLICT, "Stale offer"),
    /** The other party has to answer this offer first (Phase 8 current_turn). */
    NOT_YOUR_TURN(HttpStatus.CONFLICT, "Not your turn"),
    /**
     * The current state of an offer or a trade does not allow the action (Phase 8), e.g. accepting
     * a declined offer or completing a cancelled trade (extension currentStatus).
     */
    INVALID_STATE_TRANSITION(HttpStatus.CONFLICT, "Invalid state transition"),
    /**
     * The card of an offer is no longer available (deleted, or every copy is already promised in
     * other open trades; Phase 8).
     */
    ITEM_UNAVAILABLE(HttpStatus.CONFLICT, "Item unavailable"),
    /**
     * A block between the two collectors, or the other party's account state, forbids acting on an
     * offer or a trade (Phase 8).
     */
    TRADING_BLOCKED(HttpStatus.FORBIDDEN, "Trading blocked"),
    /**
     * The seller of a protected trade has not set up payouts yet (Phase 9): the buyer cannot pay
     * until the seller's payout account is ACTIVE.
     */
    SELLER_NOT_ONBOARDED(HttpStatus.CONFLICT, "Seller not onboarded"),
    /**
     * The dispute window of a shipped protected trade has passed (Phase 9; extension {@code
     * disputeWindowEndsAt}).
     */
    DISPUTE_WINDOW_CLOSED(HttpStatus.CONFLICT, "Dispute window closed"),
    /**
     * A party already added the maximum number of evidence items to a dispute (extension limit).
     */
    EVIDENCE_LIMIT_REACHED(HttpStatus.CONFLICT, "Evidence limit reached"),
    /** A payment provider webhook failed signature verification (Phase 9; stored as IGNORED). */
    WEBHOOK_SIGNATURE_INVALID(HttpStatus.BAD_REQUEST, "Invalid webhook signature"),
    CONFLICT(HttpStatus.CONFLICT, "Conflict"),
    /** The requested handle is already used (case-insensitively) or reserved. */
    HANDLE_TAKEN(HttpStatus.CONFLICT, "Handle taken"),
    /** Account deletion cannot proceed because of open obligations ({@code blockers[]}). */
    DELETION_BLOCKED(HttpStatus.CONFLICT, "Deletion blocked"),
    /** The caller has not accepted the current version of a required legal document. */
    TERMS_ACCEPTANCE_REQUIRED(HttpStatus.PRECONDITION_REQUIRED, "Terms acceptance required"),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "Rate limited"),
    /**
     * A freemium usage limit was reached (extensions {@code limitKey}, {@code limit}, {@code used},
     * {@code resetsAt}, {@code upgradeUrl}).
     */
    LIMIT_REACHED(HttpStatus.TOO_MANY_REQUESTS, "Limit reached"),
    PAYLOAD_TOO_LARGE(HttpStatus.CONTENT_TOO_LARGE, "Payload too large"),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Unsupported media type"),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "Internal error"),
    SERVICE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "Service unavailable");

    private static final String PROBLEM_TYPE_BASE = "https://api.orenjitrade.com/problems/";

    private final HttpStatus defaultStatus;
    private final String title;

    ErrorCode(HttpStatus defaultStatus, String title) {
        this.defaultStatus = defaultStatus;
        this.title = title;
    }

    /** The HTTP status used when an {@link ApiException} does not specify one explicitly. */
    public HttpStatus defaultStatus() {
        return defaultStatus;
    }

    /** Human readable title used as the problem {@code title}. */
    public String title() {
        return title;
    }

    /** Stable problem {@code type} URI for this code (documentation reference, never fetched). */
    public String problemType() {
        return PROBLEM_TYPE_BASE + name().toLowerCase(Locale.ROOT).replace('_', '-');
    }

    /**
     * Maps an HTTP status produced by the framework (for exceptions we do not handle explicitly) to
     * the closest error code. Unmapped 4xx statuses are reported as {@link #VALIDATION_FAILED} (the
     * request itself is wrong), unmapped 5xx statuses as {@link #INTERNAL_ERROR}.
     */
    public static ErrorCode forStatus(HttpStatusCode status) {
        return switch (status.value()) {
            case 401 -> UNAUTHENTICATED;
            case 403 -> FORBIDDEN;
            case 404 -> NOT_FOUND;
            case 409 -> CONFLICT;
            case 413 -> PAYLOAD_TOO_LARGE;
            case 415 -> UNSUPPORTED_MEDIA_TYPE;
            case 428 -> TERMS_ACCEPTANCE_REQUIRED;
            case 429 -> RATE_LIMITED;
            case 503 -> SERVICE_UNAVAILABLE;
            default -> status.is5xxServerError() ? INTERNAL_ERROR : VALIDATION_FAILED;
        };
    }
}
