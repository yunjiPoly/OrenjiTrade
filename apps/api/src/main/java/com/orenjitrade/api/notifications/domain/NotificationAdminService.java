package com.orenjitrade.api.notifications.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.notifications.infra.NotificationStatsRepository;
import com.orenjitrade.api.users.domain.UserAccountService;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin console "Notifications" (Phase 7 contract): delivery statistics (counts only) and the
 * SUPER_ADMIN broadcast of a SYSTEM notice to every reachable account (or staff only), audited as
 * {@value #ACTION_BROADCAST}. Recipients' preferences still apply (the master in-app switch).
 */
@Service
public class NotificationAdminService {

    public static final String ACTION_BROADCAST = "notification.broadcast";
    public static final String TARGET_BROADCAST = "NOTIFICATION_BROADCAST";
    static final int PAGE = 500;
    static final Pattern DEEP_LINK = Pattern.compile("^/[A-Za-z0-9/_?=&.%-]{0,199}$");

    private final NotificationStatsRepository stats;
    private final NotificationService notifications;
    private final UserAccountService accounts;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public NotificationAdminService(
            NotificationStatsRepository stats,
            NotificationService notifications,
            UserAccountService accounts,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.stats = stats;
        this.notifications = notifications;
        this.accounts = accounts;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    /** {@code GET /admin/notifications/stats}: the last {@code days} days. */
    @Transactional(readOnly = true)
    public Stats stats(int days) {
        Instant now = timeProvider.now();
        Instant from = now.minus(Duration.ofDays(days));
        Map<String, Long> byType = stats.countByType(from);
        long total = byType.values().stream().mapToLong(Long::longValue).sum();
        Map<String, Map<String, Long>> channels = new LinkedHashMap<>();
        for (String channel : List.of("realtime", "push", "email")) {
            channels.put(channel, stats.channelStates(channel, from));
        }
        return new Stats(
                from,
                now,
                total,
                stats.unread(from),
                byType,
                channels,
                stats.failed(now.minus(Duration.ofHours(24))),
                stats.pushTokens());
    }

    /**
     * {@code POST /admin/notifications/broadcast} (SUPER_ADMIN, {@code 403} otherwise): one SYSTEM
     * notice per reachable account of the audience, deduplicated per broadcast and account.
     */
    @Transactional
    public BroadcastResult broadcast(AuthenticatedUser actor, Broadcast input) {
        if (!actor.hasRole(Role.SUPER_ADMIN)) {
            throw ApiException.forbidden("Only a SUPER_ADMIN can broadcast notifications");
        }
        String title = input.title() == null ? "" : input.title().strip();
        String body = input.body() == null ? "" : input.body().strip();
        List<ProblemFieldError> errors = new ArrayList<>();
        if (title.isEmpty() || title.length() > 200) {
            errors.add(new ProblemFieldError("title", "must be 1 to 200 characters"));
        }
        if (body.isEmpty() || body.length() > 1000) {
            errors.add(new ProblemFieldError("body", "must be 1 to 1000 characters"));
        }
        if (input.deepLink() != null && !DEEP_LINK.matcher(input.deepLink()).matches()) {
            errors.add(new ProblemFieldError("deepLink", "must be an app path starting with /"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        UUID broadcastId = UUID.randomUUID();
        boolean staffOnly = input.audience() == Audience.STAFF;
        int delivered = 0;
        int skipped = 0;
        for (int page = 0; ; page++) {
            List<UUID> ids = accounts.reachableAccountIds(staffOnly, page, PAGE);
            for (UUID id : ids) {
                Map<String, @Nullable Object> data = new LinkedHashMap<>();
                data.put("kind", "BROADCAST");
                data.put("broadcastId", broadcastId.toString());
                if (input.deepLink() != null) {
                    data.put("deepLink", input.deepLink());
                }
                NotifyResult result =
                        notifications.notify(
                                new NotificationRequest(
                                        id,
                                        NotificationType.SYSTEM,
                                        title,
                                        body,
                                        data,
                                        "broadcast:" + broadcastId + ":" + id));
                if (result.delivered()) {
                    delivered++;
                } else {
                    skipped++;
                }
            }
            if (ids.size() < PAGE) {
                break;
            }
        }
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("audience", input.audience().name());
        details.put("title", title);
        details.put("recipients", delivered);
        details.put("skipped", skipped);
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_BROADCAST,
                TARGET_BROADCAST,
                broadcastId.toString(),
                details);
        return new BroadcastResult(broadcastId, input.audience(), delivered, skipped);
    }

    /** Who receives a broadcast. */
    public enum Audience {
        /** Every account that can receive notices. */
        ALL,
        /** Moderators and administrators only. */
        STAFF
    }

    /** A broadcast request. */
    public record Broadcast(
            @Nullable String title,
            @Nullable String body,
            Audience audience,
            @Nullable String deepLink) {}

    /** Outcome of a broadcast. */
    public record BroadcastResult(
            UUID broadcastId, Audience audience, int recipients, int skipped) {}

    /** Delivery statistics. */
    public record Stats(
            Instant from,
            Instant to,
            long total,
            long unread,
            Map<String, Long> byType,
            Map<String, Map<String, Long>> channels,
            long failedLast24h,
            Map<String, Long> pushTokens) {}
}
