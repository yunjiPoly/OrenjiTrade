package com.orenjitrade.api.binders.domain;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.profiles.domain.ProfileVisibility;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * Effective public visibility (Phase 3 contract), in one place for binders and inventory items. An
 * item is public ⇔ its visibility is PUBLIC or TEMPORARILY_PUBLIC not yet expired ∧ its binder is
 * public (or it has none) ∧ its freshness is not HIDDEN ∧ the owner is listed. A binder is public ⇔
 * its visibility is PUBLIC or TEMPORARILY_PUBLIC not yet expired ∧ its freshness is not HIDDEN ∧
 * the owner is listed. The owner is listed ⇔ the account is ACTIVE (or its temporary suspension has
 * ended) ∧ the collector is discoverable or has a PUBLIC profile ∧ the profile is not PRIVATE.
 *
 * <p>The SQL fragments below (aliases {@code u} = {@code user_account}, {@code ps} = {@code
 * privacy_settings}, parameter {@code :now}) and the pure Java predicates express the same rules;
 * {@code VisibilityRulesTest} and {@code VisibilityIT} keep them aligned. Every public read
 * re-evaluates them; nothing trusts a stored flag alone.
 */
public final class PublicVisibilityRules {

    /** Longest temporary publication. */
    public static final Duration MAX_TEMPORARY = Duration.ofDays(30);

    /** Joins {@code user_account u} and {@code privacy_settings ps} for an owner column. */
    public static String ownerJoins(String ownerColumn) {
        return " JOIN user_account u ON u.id = "
                + ownerColumn
                + " LEFT JOIN privacy_settings ps ON ps.user_id = "
                + ownerColumn
                + " ";
    }

    /** The owner is listed (needs {@link #ownerJoins}). */
    public static final String OWNER_LISTED =
            "((u.status = 'ACTIVE' OR (u.status = 'SUSPENDED' AND u.suspended_until IS NOT NULL"
                    + " AND u.suspended_until <= :now))"
                    + " AND (COALESCE(ps.discoverable, false)"
                    + " OR COALESCE(ps.profile_visibility, 'MEMBERS') = 'PUBLIC')"
                    + " AND COALESCE(ps.profile_visibility, 'MEMBERS') <> 'PRIVATE')";

    private PublicVisibilityRules() {}

    /** The binder aliased {@code alias} is itself public (visibility, expiry, freshness). */
    public static String binderListed(String alias) {
        return "(("
                + alias
                + ".visibility = 'PUBLIC' OR ("
                + alias
                + ".visibility = 'TEMPORARILY_PUBLIC' AND "
                + alias
                + ".public_until > :now)) AND "
                + alias
                + ".freshness_state <> 'HIDDEN')";
    }

    /** The binder aliased {@code alias} is effectively public (needs {@link #ownerJoins}). */
    public static String binderEffectivelyPublic(String alias) {
        return "(" + binderListed(alias) + " AND " + OWNER_LISTED + ")";
    }

    // ---------------------------------------------------------------------------------------
    // Pure Java form of the same rules
    // ---------------------------------------------------------------------------------------

    /** Visibility, expiry and freshness of one binder or item. */
    public static boolean isListed(
            ListingVisibility visibility,
            @Nullable Instant publicUntil,
            FreshnessState freshness,
            Instant now) {
        boolean visible =
                switch (visibility) {
                    case PUBLIC -> true;
                    case TEMPORARILY_PUBLIC -> publicUntil != null && publicUntil.isAfter(now);
                    case PRIVATE -> false;
                };
        return visible && freshness != FreshnessState.HIDDEN;
    }

    /** Whether an owner's listings may be public. */
    public static boolean isOwnerListed(
            AccountStatus status,
            @Nullable Instant suspendedUntil,
            boolean discoverable,
            ProfileVisibility profileVisibility,
            Instant now) {
        boolean active =
                status == AccountStatus.ACTIVE
                        || (status == AccountStatus.SUSPENDED
                                && suspendedUntil != null
                                && !suspendedUntil.isAfter(now));
        return active
                && (discoverable || profileVisibility == ProfileVisibility.PUBLIC)
                && profileVisibility != ProfileVisibility.PRIVATE;
    }

    /**
     * Whether an item is effectively public.
     *
     * @param binderListed {@code null} when the item has no binder, otherwise {@link #isListed} of
     *     its binder
     */
    public static boolean isItemPublic(
            boolean itemListed, @Nullable Boolean binderListed, boolean ownerListed) {
        return itemListed && (binderListed == null || binderListed) && ownerListed;
    }

    // ---------------------------------------------------------------------------------------
    // Validation of an owner's visibility choice
    // ---------------------------------------------------------------------------------------

    /**
     * Checks {@code publicUntil} for a visibility: TEMPORARILY_PUBLIC needs an end in the future at
     * most {@link #MAX_TEMPORARY} ahead; for the other visibilities it is ignored.
     */
    public static List<ProblemFieldError> validatePublicUntil(
            ListingVisibility visibility, @Nullable Instant publicUntil, Instant now) {
        List<ProblemFieldError> errors = new ArrayList<>();
        if (visibility != ListingVisibility.TEMPORARILY_PUBLIC) {
            return errors;
        }
        if (publicUntil == null) {
            errors.add(
                    new ProblemFieldError(
                            "publicUntil", "is required when visibility is TEMPORARILY_PUBLIC"));
        } else if (!publicUntil.isAfter(now)) {
            errors.add(new ProblemFieldError("publicUntil", "must be in the future"));
        } else if (publicUntil.isAfter(now.plus(MAX_TEMPORARY))) {
            errors.add(new ProblemFieldError("publicUntil", "must be at most 30 days ahead"));
        }
        return errors;
    }

    /** {@code publicUntil} as stored for a visibility ({@code null} unless TEMPORARILY_PUBLIC). */
    public static @Nullable Instant storedPublicUntil(
            ListingVisibility visibility, @Nullable Instant publicUntil) {
        return visibility == ListingVisibility.TEMPORARILY_PUBLIC ? publicUntil : null;
    }
}
