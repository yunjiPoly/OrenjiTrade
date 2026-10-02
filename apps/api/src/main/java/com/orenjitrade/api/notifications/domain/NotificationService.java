package com.orenjitrade.api.notifications.domain;

import com.orenjitrade.api.billing.domain.LimitDecision;
import com.orenjitrade.api.billing.domain.LimitReachedException;
import com.orenjitrade.api.billing.domain.Limits;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.notifications.domain.ChannelPlan.DeliveryState;
import com.orenjitrade.api.notifications.events.NotificationCreated;
import com.orenjitrade.api.notifications.infra.NotificationRepository;
import com.orenjitrade.api.notifications.infra.NotificationRepository.NewRow;
import com.orenjitrade.api.notifications.infra.NotificationRepository.Row;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * The notification centre (Phase 6 contract "Matching pipeline" and notification endpoints).
 *
 * <p>{@link #notify} is the single entry point of other modules: it is idempotent per dedup key,
 * applies the recipient's preferences (master and category switches, quiet hours for push), the
 * per-type daily limit of the recipient's plan ({@link NotificationType#dailyLimitKey()}, e.g.
 * {@code wishlist.alerts.per_day}; beyond it a single "upgrade" notice per day and type), stores
 * the row and publishes {@link NotificationCreated}, which the dispatcher fans out after commit
 * (in-app realtime queue, push, email). It joins the caller's transaction.
 */
@Service
public class NotificationService {

    public static final int DEFAULT_LIMIT = 20;
    public static final int MAX_LIMIT = 50;
    static final int TITLE_MAX = 200;
    static final int BODY_MAX = 1000;
    static final int EXPORT_MAX = 1000;
    static final String NOT_FOUND = "Notification not found";

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    private final NotificationRepository repository;
    private final NotificationPreferencesService preferences;
    private final Limits limits;
    private final UserAccountService accounts;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public NotificationService(
            NotificationRepository repository,
            NotificationPreferencesService preferences,
            Limits limits,
            UserAccountService accounts,
            ApplicationEventPublisher events,
            TimeProvider timeProvider,
            JsonMapper jsonMapper) {
        this.repository = repository;
        this.preferences = preferences;
        this.limits = limits;
        this.accounts = accounts;
        this.events = events;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
    }

    // ---------------------------------------------------------------------------------------
    // Creation (other modules)
    // ---------------------------------------------------------------------------------------

    /** Stores and schedules one notification (see the class comment); never throws for rules. */
    @Transactional
    public NotifyResult notify(NotificationRequest request) {
        repository.lock(request.dedupKey());
        Optional<UUID> existing = repository.findIdByDedupKey(request.dedupKey());
        if (existing.isPresent()) {
            return new NotifyResult(NotifyResult.Outcome.DUPLICATE, existing.get());
        }
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        if (!isReachable(request.userId(), now)) {
            return new NotifyResult(NotifyResult.Outcome.RECIPIENT_UNAVAILABLE, null);
        }
        NotificationSettings settings = preferences.settingsOf(request.userId());
        ChannelPlan plan = ChannelPlan.of(settings, request.type(), now);
        if (!plan.wanted()) {
            return new NotifyResult(NotifyResult.Outcome.SUPPRESSED, null);
        }
        @Nullable String limitKey = request.type().dailyLimitKey();
        if (limitKey != null) {
            try {
                limits.consume(request.userId(), limitKey);
            } catch (LimitReachedException e) {
                limitNotice(request, e.decision(), settings, now);
                return new NotifyResult(NotifyResult.Outcome.LIMITED, null);
            }
        }
        Optional<UUID> created =
                store(
                        request.userId(),
                        request.type(),
                        request.title(),
                        request.body(),
                        request.data(),
                        request.dedupKey(),
                        plan,
                        now);
        return created.map(id -> new NotifyResult(NotifyResult.Outcome.CREATED, id))
                .orElseGet(
                        () ->
                                new NotifyResult(
                                        NotifyResult.Outcome.DUPLICATE,
                                        repository
                                                .findIdByDedupKey(request.dedupKey())
                                                .orElse(null)));
    }

    /**
     * The single notice of the day telling the collector that more notifications of {@code type}
     * were held back by their plan (dedup key {@code limit:<user>:<type>:<UTC day>}).
     */
    private void limitNotice(
            NotificationRequest request,
            LimitDecision decision,
            NotificationSettings settings,
            Instant now) {
        String key =
                "limit:"
                        + request.userId()
                        + ":"
                        + request.type().name()
                        + ":"
                        + LocalDate.ofInstant(now, ZoneOffset.UTC);
        if (repository.existsByDedupKey(key)) {
            return;
        }
        ChannelPlan plan = ChannelPlan.of(settings, NotificationType.SYSTEM, now);
        if (!plan.wanted()) {
            return;
        }
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        data.put("kind", "LIMIT_REACHED");
        data.put("notificationType", request.type().name());
        data.put("limitKey", decision.key());
        data.put("limit", decision.limit());
        data.put("planCode", decision.planCode());
        data.put("upgradeUrl", decision.upgradeUrl());
        data.put("deepLink", decision.upgradeUrl());
        String title;
        String body;
        if (request.type() == NotificationType.WISHLIST_MATCH) {
            title = "More wishlist matches are waiting";
            body =
                    "You reached today's limit of "
                            + decision.limit()
                            + " wishlist alerts on your plan. New matches still appear on your"
                            + " wishlist; upgrade to Premium for unlimited alerts.";
        } else {
            title = "More notifications are waiting";
            body =
                    "You reached today's limit of "
                            + decision.limit()
                            + " notifications of this kind on your plan. Upgrade to Premium for"
                            + " unlimited alerts.";
        }
        store(request.userId(), NotificationType.SYSTEM, title, body, data, key, plan, now);
    }

    private Optional<UUID> store(
            UUID userId,
            NotificationType type,
            String title,
            String body,
            Map<String, @Nullable Object> data,
            String dedupKey,
            ChannelPlan plan,
            Instant now) {
        UUID id = UUID.randomUUID();
        Optional<UUID> inserted =
                repository.insert(
                        new NewRow(
                                id,
                                userId,
                                type.name(),
                                truncate(title.isBlank() ? "OrenjiTrade" : title, TITLE_MAX),
                                truncate(body, BODY_MAX),
                                jsonMapper.writeValueAsString(data),
                                dedupKey,
                                plan.inApp(),
                                now,
                                jsonMapper.writeValueAsString(initialChannelState(plan))));
        inserted.ifPresent(
                created ->
                        events.publishEvent(
                                new NotificationCreated(created, userId, type.name(), now)));
        return inserted;
    }

    static Map<String, @Nullable Object> initialChannelState(ChannelPlan plan) {
        Map<String, @Nullable Object> state = new LinkedHashMap<>();
        state.put(
                "realtime",
                plan.inApp() ? DeliveryState.PENDING.name() : DeliveryState.SKIPPED.name());
        state.put("push", plan.push().name());
        if (plan.pushReason() != null) {
            state.put("pushReason", plan.pushReason());
        }
        state.put("email", plan.email().name());
        if (plan.emailReason() != null) {
            state.put("emailReason", plan.emailReason());
        }
        return state;
    }

    private boolean isReachable(UUID userId, Instant now) {
        Optional<UserAccountSnapshot> account = accounts.findSnapshot(userId);
        if (account.isEmpty()) {
            return false;
        }
        return switch (account.get().status()) {
            case ACTIVE -> true;
            case SUSPENDED -> !account.get().isSuspendedAt(now);
            case DELETION_REQUESTED, DELETED -> false;
        };
    }

    // ---------------------------------------------------------------------------------------
    // Notification centre (the recipient)
    // ---------------------------------------------------------------------------------------

    /** {@code GET /notifications}: in-app notifications, newest first, cursor-paginated. */
    @Transactional(readOnly = true)
    public CursorPage<NotificationView> list(
            UUID userId, @Nullable String cursor, boolean unreadOnly, int limit) {
        @Nullable TimeCursor after = TimeCursor.decode(cursor);
        List<Row> rows = repository.page(userId, after, unreadOnly, limit + 1);
        boolean more = rows.size() > limit;
        List<Row> slice = more ? rows.subList(0, limit) : rows;
        List<NotificationView> views = new ArrayList<>();
        for (Row row : slice) {
            views.add(view(row));
        }
        if (!more) {
            return CursorPage.last(views);
        }
        Row last = slice.get(slice.size() - 1);
        return CursorPage.of(views, new TimeCursor(last.createdAt(), last.id()).encode());
    }

    @Transactional(readOnly = true)
    public long unreadCount(UUID userId) {
        return repository.unreadCount(userId);
    }

    /** {@code POST /notifications/{id}/read}: idempotent; 404 for other users' notifications. */
    @Transactional
    public NotificationView markRead(UUID userId, UUID notificationId) {
        return repository
                .markRead(userId, notificationId, timeProvider.now())
                .map(this::view)
                .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
    }

    /** {@code POST /notifications/read-all}: the number of notifications marked read. */
    @Transactional
    public int markAllRead(UUID userId) {
        return repository.markAllRead(userId, timeProvider.now());
    }

    /** The unread MESSAGE notifications of a conversation the user just read. */
    @Transactional
    public int markConversationRead(UUID userId, UUID conversationId) {
        return repository.markConversationRead(userId, conversationId, timeProvider.now());
    }

    /** One stored notification (dispatcher). */
    @Transactional(readOnly = true)
    public Optional<NotificationView> find(UUID notificationId) {
        return repository.find(notificationId).map(this::view);
    }

    /** Export section: the user's notifications (newest first, at most 1 000). */
    @Transactional(readOnly = true)
    public List<Map<String, @Nullable Object>> export(UUID userId) {
        List<Map<String, @Nullable Object>> result = new ArrayList<>();
        for (Row row : repository.allOf(userId, EXPORT_MAX)) {
            Map<String, @Nullable Object> entry = new LinkedHashMap<>();
            entry.put("id", row.id());
            entry.put("type", row.type());
            entry.put("title", row.title());
            entry.put("body", row.body());
            entry.put("data", parse(row.data()));
            entry.put("createdAt", row.createdAt());
            entry.put("readAt", row.readAt());
            result.add(entry);
        }
        return result;
    }

    @Transactional
    public void purge(UUID userId) {
        repository.deleteByUser(userId);
    }

    NotificationView view(Row row) {
        NotificationType type;
        try {
            type = NotificationType.valueOf(row.type());
        } catch (IllegalArgumentException e) {
            type = NotificationType.SYSTEM;
        }
        return new NotificationView(
                row.id(),
                type,
                row.title(),
                row.body(),
                NotificationCards.forClients(parse(row.data())),
                row.createdAt(),
                row.readAt());
    }

    String json(Object value) {
        return jsonMapper.writeValueAsString(value);
    }

    Map<String, Object> parse(String json) {
        try {
            Map<String, Object> value = jsonMapper.readValue(json, MAP);
            return value == null ? Map.of() : value;
        } catch (JacksonException e) {
            log.warn("Unreadable notification JSON: {}", e.getOriginalMessage());
            return Map.of();
        }
    }

    private static String truncate(String text, int max) {
        String value = text.strip();
        return value.length() <= max ? value : value.substring(0, max - 1) + "…";
    }
}
