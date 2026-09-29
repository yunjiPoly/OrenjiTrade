package com.orenjitrade.api.delisting.domain;

import java.time.Duration;
import java.time.Instant;

/**
 * Human label of a listing's freshness ({@code "Updated 3 hours ago"}), computed from its last
 * confirmation. Coarse on purpose: it never reveals more than the owner's listing activity.
 */
public final class FreshnessLabels {

    private FreshnessLabels() {}

    public static String label(Instant confirmedAt, Instant now) {
        Duration age = Duration.between(confirmedAt, now);
        if (age.isNegative() || age.compareTo(Duration.ofMinutes(1)) < 0) {
            return "Updated just now";
        }
        if (age.compareTo(Duration.ofHours(1)) < 0) {
            return "Updated " + plural(age.toMinutes(), "minute") + " ago";
        }
        if (age.compareTo(Duration.ofDays(1)) < 0) {
            return "Updated " + plural(age.toHours(), "hour") + " ago";
        }
        if (age.compareTo(Duration.ofDays(2)) < 0) {
            return "Updated yesterday";
        }
        if (age.compareTo(Duration.ofDays(30)) < 0) {
            return "Updated " + age.toDays() + " days ago";
        }
        if (age.compareTo(Duration.ofDays(365)) < 0) {
            return "Updated " + plural(age.toDays() / 30, "month") + " ago";
        }
        return "Updated over a year ago";
    }

    private static String plural(long count, String unit) {
        return count + " " + unit + (count == 1 ? "" : "s");
    }
}
