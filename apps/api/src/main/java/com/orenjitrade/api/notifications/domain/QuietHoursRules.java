package com.orenjitrade.api.notifications.domain;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;

/**
 * Pure quiet-hours evaluation: whether an instant falls inside the collector's push-free period, in
 * the collector's time zone. {@code end} before {@code start} spans midnight; {@code start} equal
 * to {@code end} means no quiet period. Unknown zones fall back to UTC and malformed times disable
 * the period (the settings endpoint validates both).
 */
public final class QuietHoursRules {

    private QuietHoursRules() {}

    public static boolean isQuiet(QuietHours quietHours, Instant now) {
        if (!quietHours.enabled()) {
            return false;
        }
        LocalTime start;
        LocalTime end;
        try {
            start = LocalTime.parse(quietHours.start());
            end = LocalTime.parse(quietHours.end());
        } catch (DateTimeParseException e) {
            return false;
        }
        if (start.equals(end)) {
            return false;
        }
        ZoneId zone;
        try {
            zone = ZoneId.of(quietHours.timezone());
        } catch (DateTimeException e) {
            zone = ZoneOffset.UTC;
        }
        LocalTime local = LocalTime.ofInstant(now, zone);
        if (start.isBefore(end)) {
            return !local.isBefore(start) && local.isBefore(end);
        }
        return !local.isBefore(start) || local.isBefore(end);
    }
}
