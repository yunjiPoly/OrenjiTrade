package com.orenjitrade.api.deals.domain;

import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.inventory.domain.InventoryService;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * The pure rules of a sale (stage R4, Mark as sold): the copies sold, the tracking number and the
 * undo window. Unit-tested.
 */
public final class SaleRules {

    /**
     * How long the seller can undo a sale (spec section 16, default 4: "a sale can be undone for 10
     * minutes, and only before anyone has rated it"); the same 10 minutes as the undo of a delete,
     * which keeps the card that left the inventory restorable that long.
     */
    public static final Duration UNDO_WINDOW = InventoryService.RESTORE_WINDOW;

    /** Longest tracking number ({@code sale.tracking_number}). */
    public static final int TRACKING_MAX = 64;

    /** Most copies sold at once (the inventory's copies limit). */
    public static final int QUANTITY_MAX = InventoryService.QUANTITY_MAX;

    /** Letters, digits, spaces, dots and dashes, starting with a letter or a digit. */
    private static final Pattern TRACKING = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9 .\\-]*$");

    private static final Pattern SPACES = Pattern.compile("\\s+");

    private SaleRules() {}

    /** The tracking number as stored: trimmed, inner spaces collapsed; {@code null} when blank. */
    public static @Nullable String tracking(@Nullable String raw) {
        if (raw == null) {
            return null;
        }
        String cleaned = SPACES.matcher(raw.strip()).replaceAll(" ");
        return cleaned.isEmpty() ? null : cleaned;
    }

    /**
     * What is wrong with a sale's request: copies below 1 or above {@link #QUANTITY_MAX} (the
     * copies actually held are checked under the lock), a deck core sold in more than one copy, a
     * tracking number that is too long or holds anything but letters, digits, spaces, dots and
     * dashes.
     *
     * @param tracking the cleaned tracking number ({@link #tracking})
     */
    public static List<ProblemFieldError> validate(
            int quantity, @Nullable String tracking, boolean deckCore) {
        List<ProblemFieldError> errors = new ArrayList<>();
        if (quantity < 1 || quantity > QUANTITY_MAX) {
            errors.add(new ProblemFieldError("quantity", "must be between 1 and " + QUANTITY_MAX));
        } else if (deckCore && quantity != 1) {
            errors.add(new ProblemFieldError("quantity", "a deck core sells as one"));
        }
        if (tracking != null) {
            if (tracking.length() > TRACKING_MAX) {
                errors.add(
                        new ProblemFieldError(
                                "trackingNumber",
                                "must be at most " + TRACKING_MAX + " characters"));
            } else if (!TRACKING.matcher(tracking).matches()) {
                errors.add(
                        new ProblemFieldError(
                                "trackingNumber",
                                "use letters, digits, spaces, dots and dashes only"));
            }
        }
        return errors;
    }

    /** Until when the seller can undo a sale made at {@code createdAt}. */
    public static Instant undoableUntil(Instant createdAt) {
        return createdAt.plus(UNDO_WINDOW);
    }

    /** Whether a sale made at {@code createdAt} can still be undone at {@code now}. */
    public static boolean undoable(Instant createdAt, Instant now) {
        return now.isBefore(undoableUntil(createdAt));
    }

    /**
     * The neutral body of the sale's SYSTEM message, for clients that do not word it per side (the
     * phone does: "You marked …" / "… marked … as sold to you."). No tracking number in it.
     */
    public static String messageBody(String sellerHandle, String name, String buyerHandle) {
        return sellerHandle + " marked " + name + " as sold to " + buyerHandle + ".";
    }

    /** The buyer's notification: "{seller} marked {card} as sold to you". */
    public static String notificationTitle(String sellerHandle, String name) {
        return sellerHandle + " marked " + name + " as sold to you";
    }
}
