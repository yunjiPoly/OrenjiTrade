package com.orenjitrade.api.audit.domain;

import com.orenjitrade.api.audit.api.AuditActor;
import com.orenjitrade.api.audit.api.AuditLogEntry;
import com.orenjitrade.api.audit.domain.AuditTargetLabels.Target;
import com.orenjitrade.api.audit.domain.AuditTargetLabels.TargetRef;
import com.orenjitrade.api.audit.infra.AuditLogRepository;
import com.orenjitrade.api.audit.infra.AuditLogSpecifications;
import com.orenjitrade.api.auth.domain.AccountNames;
import com.orenjitrade.api.auth.domain.AccountNames.AccountName;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Read side of the audit log (admin console). Entries are returned as stored, with the acting
 * account named, a readable target label (spec 15.8) and the details staff may read: a module's
 * {@link AuditTargetLabels} replaces what may not reach staff (an archived city channel's slug),
 * the record itself is never rewritten.
 */
@Service
public class AuditQueryService {

    private static final TypeReference<Map<String, Object>> DETAILS_TYPE = new TypeReference<>() {};

    private final AuditLogRepository repository;
    private final ObjectProvider<AccountNames> accountNames;
    private final ObjectProvider<AuditTargetLabels> labelers;
    private final JsonMapper jsonMapper;

    public AuditQueryService(
            AuditLogRepository repository,
            ObjectProvider<AccountNames> accountNames,
            ObjectProvider<AuditTargetLabels> labelers,
            JsonMapper jsonMapper) {
        this.repository = repository;
        this.accountNames = accountNames;
        this.labelers = labelers;
        this.jsonMapper = jsonMapper;
    }

    @Transactional(readOnly = true)
    public Page<AuditLogEntry> search(AuditLogFilter filter, int page, int size) {
        PageRequest pageable =
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "occurredAt", "id"));
        Page<AuditLog> result =
                repository.findAll(AuditLogSpecifications.matching(filter), pageable);
        List<AuditLogEntry> entries = toEntries(result.getContent());
        return new PageImpl<>(entries, pageable, result.getTotalElements());
    }

    /**
     * Searches by a readable target ("@handle", "#1047", a setting key): the target it names, or
     * the stored target id itself when nothing names it (a feature flag key, a game slug).
     */
    @Transactional(readOnly = true)
    public Page<AuditLogEntry> search(
            AuditLogFilter filter, @Nullable String target, int page, int size) {
        String text = target == null ? "" : target.strip();
        if (text.isEmpty()) {
            return search(filter, page, size);
        }
        Optional<TargetRef> ref = resolve(text);
        if (ref.isPresent()) {
            return search(
                    filter.onTarget(ref.get().targetType(), ref.get().targetId()), page, size);
        }
        return search(
                new AuditLogFilter(
                        filter.actorId(),
                        filter.targetType(),
                        text,
                        filter.action(),
                        filter.from(),
                        filter.to(),
                        filter.actorType()),
                page,
                size);
    }

    /** The most recent entries targeting one object, newest first. */
    @Transactional(readOnly = true)
    public List<AuditLogEntry> recentForTarget(String targetType, String targetId, int limit) {
        return toEntries(
                repository.findByTargetTypeAndTargetIdOrderByOccurredAtDesc(
                        targetType, targetId, PageRequest.of(0, limit)));
    }

    private Optional<TargetRef> resolve(String text) {
        if (text.startsWith("@")) {
            @Nullable AccountNames names = accountNames.getIfAvailable();
            return names == null
                    ? Optional.empty()
                    : names.idOfHandle(text)
                            .map(id -> new TargetRef(AuditService.TARGET_USER, id.toString()));
        }
        for (AuditTargetLabels labeler : labelers.orderedStream().toList()) {
            Optional<TargetRef> ref = labeler.resolve(text);
            if (ref.isPresent()) {
                return ref;
            }
        }
        return Optional.empty();
    }

    private List<AuditLogEntry> toEntries(List<AuditLog> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> details = new ArrayList<>(rows.size());
        Set<UUID> people = new HashSet<>();
        for (AuditLog row : rows) {
            details.add(parseDetails(row.getDetails()));
            if (row.getActorUserId() != null) {
                people.add(row.getActorUserId());
            }
            if (AuditService.TARGET_USER.equals(row.getTargetType())) {
                uuid(row.getTargetId()).ifPresent(people::add);
            }
        }
        List<Map<String, Object>> shown = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            shown.add(staffDetails(rows.get(i), details.get(i)));
            // Every id in the details may name an account (an author, a ratee, an assignee).
            for (Object value : shown.get(i).values()) {
                uuid(value).ifPresent(people::add);
            }
        }
        @Nullable AccountNames names = accountNames.getIfAvailable();
        Map<UUID, AccountName> named = names == null ? Map.of() : names.namesOf(people);
        Map<String, Map<String, String>> labels = moduleLabels(rows, details);
        Map<String, Map<String, String>> idLabels = idLabels(shown);
        Map<String, Map<String, String>> valueLabels = valueLabels(rows, shown);
        List<AuditLogEntry> entries = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            AuditLog row = rows.get(i);
            Map<String, String> detailLabels =
                    detailLabels(
                            shown.get(i),
                            named,
                            idLabels,
                            valueLabels.getOrDefault(row.getTargetType(), Map.of()));
            entries.add(toEntry(row, details.get(i), shown.get(i), detailLabels, named, labels));
        }
        return entries;
    }

    /** The details staff may read: each module's {@link AuditTargetLabels#staffDetails}. */
    private Map<String, Object> staffDetails(AuditLog entry, Map<String, Object> stored) {
        Map<String, Object> details = stored;
        for (AuditTargetLabels labeler : labelers.orderedStream().toList()) {
            if (labeler.targetTypes().contains(entry.getTargetType())) {
                details =
                        labeler.staffDetails(
                                entry.getAction(),
                                entry.getTargetType(),
                                entry.getTargetId(),
                                details);
            }
        }
        return details;
    }

    /** Labels from the modules' {@link AuditTargetLabels}, by target type then target id. */
    private Map<String, Map<String, String>> moduleLabels(
            List<AuditLog> rows, List<Map<String, Object>> details) {
        Map<String, List<Target>> byType = new LinkedHashMap<>();
        for (int i = 0; i < rows.size(); i++) {
            AuditLog row = rows.get(i);
            if (row.getTargetId() != null) {
                byType.computeIfAbsent(row.getTargetType(), type -> new ArrayList<>())
                        .add(new Target(row.getTargetId(), details.get(i)));
            }
        }
        return labelsByType(byType);
    }

    /**
     * Labels of the objects the details name by id ({@code reportId} "Report #1047", a flag's
     * {@code subjectId} "A post in …"), from the modules' {@link AuditTargetLabels}.
     */
    private Map<String, Map<String, String>> idLabels(List<Map<String, Object>> shown) {
        Map<String, List<Target>> byType = new LinkedHashMap<>();
        for (Map<String, Object> details : shown) {
            details.forEach(
                    (key, value) -> {
                        @Nullable String type = idTargetType(key, details);
                        if (type != null && uuid(value).isPresent()) {
                            byType.computeIfAbsent(type, t -> new ArrayList<>())
                                    .add(new Target((String) value, Map.of()));
                        }
                    });
        }
        return labelsByType(byType);
    }

    private Map<String, Map<String, String>> labelsByType(Map<String, List<Target>> byType) {
        Map<String, Map<String, String>> labels = new HashMap<>();
        for (AuditTargetLabels labeler : labelers.orderedStream().toList()) {
            for (String type : labeler.targetTypes()) {
                List<Target> targets = byType.get(type);
                if (targets != null && !targets.isEmpty()) {
                    labels.computeIfAbsent(type, key -> new HashMap<>())
                            .putAll(labeler.labelsOf(type, targets));
                }
            }
        }
        return labels;
    }

    /** The modules' names of plain values (region codes, room slugs), by target type. */
    private Map<String, Map<String, String>> valueLabels(
            List<AuditLog> rows, List<Map<String, Object>> shown) {
        Map<String, List<Map<String, Object>>> byType = new LinkedHashMap<>();
        for (int i = 0; i < rows.size(); i++) {
            byType.computeIfAbsent(rows.get(i).getTargetType(), type -> new ArrayList<>())
                    .add(shown.get(i));
        }
        Map<String, Map<String, String>> labels = new HashMap<>();
        for (AuditTargetLabels labeler : labelers.orderedStream().toList()) {
            for (String type : labeler.targetTypes()) {
                List<Map<String, Object>> details = byType.get(type);
                if (details != null && !details.isEmpty()) {
                    labels.computeIfAbsent(type, key -> new HashMap<>())
                            .putAll(labeler.valueLabels(type, details));
                }
            }
        }
        return labels;
    }

    /**
     * One entry's labels of the values in its details (web stage WH2 review fix 1, spec 15.2: never
     * a raw id): an account's id reads "@handle", a report's "Report #1047", an id nothing names
     * reads in words ("A moderator note"), a region code and a room's slug read as their names.
     */
    static Map<String, String> detailLabels(
            Map<String, Object> shown,
            Map<UUID, AccountName> named,
            Map<String, Map<String, String>> idLabels,
            Map<String, String> valueLabels) {
        Map<String, String> labels = new LinkedHashMap<>();
        shown.forEach(
                (key, value) -> {
                    if (!(value instanceof String text) || labels.containsKey(text)) {
                        return;
                    }
                    Optional<UUID> id = uuid(text);
                    if (id.isPresent()) {
                        @Nullable AccountName account = named.get(id.get());
                        @Nullable String type = idTargetType(key, shown);
                        @Nullable String module =
                                type == null
                                        ? null
                                        : idLabels.getOrDefault(type, Map.of()).get(text);
                        labels.put(
                                text,
                                account != null
                                        ? "@" + account.handle()
                                        : module != null ? module : idWords(key, shown));
                    } else if (valueLabels.containsKey(text)) {
                        labels.put(text, valueLabels.get(text));
                    }
                });
        return labels;
    }

    /** The target type of an id the details name under {@code key}, or {@code null}. */
    private static @Nullable String idTargetType(String key, Map<String, Object> details) {
        return switch (key) {
            case "reportId" -> "REPORT";
            case "postId" -> "COMMUNITY_POST";
            case "replyId" -> "COMMUNITY_REPLY";
            case "ratingId" -> "RATING";
            case "binderId" -> "BINDER";
            case "cardId" -> "CARD";
            case "setId" -> "CARD_SET";
            case "printingId", "cardPrintingId" -> "CARD_PRINTING";
            case "subjectId" ->
                    details.get("subjectType") instanceof String type
                                    && type.startsWith("COMMUNITY_")
                            ? type
                            : null;
            default -> null;
        };
    }

    /** Words for an id nothing names (gone, or a kind of object staff never open by id). */
    private static String idWords(String key, Map<String, Object> details) {
        return switch (key) {
            case "authorId",
                    "rateeId",
                    "raterId",
                    "ownerId",
                    "assigneeId",
                    "reportedUserId",
                    "userId" ->
                    "A deleted account";
            case "subjectId" ->
                    switch (String.valueOf(details.get("subjectType"))) {
                        case "MESSAGE" -> "A private message";
                        case "COMMUNITY_POST" -> "A post";
                        case "COMMUNITY_REPLY" -> "A reply";
                        default -> "A deleted account";
                    };
            case "noteId" -> "A moderator note";
            case "conversationId" -> "A conversation";
            case "postId" -> "A post";
            case "replyId" -> "A reply";
            case "reportId" -> "A report";
            case "requestId" -> "A deletion request";
            case "tradeId" -> "A trade";
            case "paymentId" -> "A payment";
            case "disputeId" -> "A dispute";
            case "evidenceId" -> "A piece of evidence";
            case "messageId" -> "A message";
            case "broadcastId" -> "An announcement";
            case "ratingId" -> "A rating";
            case "binderId" -> "A binder";
            case "cardId" -> "A card";
            case "setId" -> "A card set";
            case "printingId", "cardPrintingId" -> "A printing";
            default -> "Not shown";
        };
    }

    private AuditLogEntry toEntry(
            AuditLog entry,
            Map<String, Object> stored,
            Map<String, Object> shown,
            Map<String, String> detailLabels,
            Map<UUID, AccountName> named,
            Map<String, Map<String, String>> labels) {
        @Nullable UUID actorId = entry.getActorUserId();
        @Nullable AccountName actorName = actorId == null ? null : named.get(actorId);
        AuditActor actor =
                new AuditActor(
                        actorId,
                        actorName == null ? null : actorName.handle(),
                        entry.getActorType(),
                        actorName == null ? null : actorName.displayName(),
                        actorName == null || actorName.staffRole() == null
                                ? null
                                : actorName.staffRole().name());
        return new AuditLogEntry(
                entry.getId(),
                entry.getOccurredAt(),
                actor,
                entry.getAction(),
                entry.getTargetType(),
                entry.getTargetId(),
                shown,
                entry.getRequestId(),
                targetLabel(entry, stored, named, labels),
                detailLabels);
    }

    /** A readable name of the entry's target, {@code null} when none is known. */
    private static @Nullable String targetLabel(
            AuditLog entry,
            Map<String, Object> details,
            Map<UUID, AccountName> named,
            Map<String, Map<String, String>> labels) {
        String type = entry.getTargetType();
        @Nullable String id = entry.getTargetId();
        if (id != null) {
            @Nullable String fromModule = labels.getOrDefault(type, Map.of()).get(id);
            if (fromModule != null) {
                return fromModule;
            }
        }
        return switch (type) {
            case AuditService.TARGET_USER ->
                    uuid(id).map(named::get).map(name -> "@" + name.handle()).orElse(null);
            case "RATING" -> handleLabel("Rating of @", details.get("rateeId"), named);
            case "REFERENCE" -> handleLabel("Reference about @", details.get("subjectId"), named);
            case "FEATURE_FLAG" -> id;
            case "USAGE_LIMIT" -> text(details.get("limitKey"), id);
            case "PLATFORM_SETTINGS" -> settingsLabel(id);
            case "DELIST_POLICY" -> "Auto-delist rules";
            case "NOTIFICATION_BROADCAST" -> "An announcement";
            case "CARD_IMAGE" -> "A card image";
            case "PAYMENT" -> "A payment";
            default -> null;
        };
    }

    /** The details key naming the account a rating or a reference is about. */
    private static @Nullable String subjectKey(String targetType) {
        return switch (targetType) {
            case "RATING" -> "rateeId";
            case "REFERENCE" -> "subjectId";
            default -> null;
        };
    }

    private static @Nullable String handleLabel(
            String prefix, @Nullable Object id, Map<UUID, AccountName> named) {
        return uuid(id).map(named::get).map(name -> prefix + name.handle()).orElse(null);
    }

    private static @Nullable String settingsLabel(@Nullable String id) {
        if (id == null) {
            return null;
        }
        if (id.startsWith("wishlist")) {
            return "Wishlist terms";
        }
        if (id.startsWith("inventory.import")) {
            return "Import limits";
        }
        return id;
    }

    private static @Nullable String text(@Nullable Object value, @Nullable String fallback) {
        return value instanceof String s && !s.isBlank() ? s : fallback;
    }

    private static Optional<UUID> uuid(@Nullable Object value) {
        if (!(value instanceof String s) || s.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(UUID.fromString(s));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    private Map<String, Object> parseDetails(@Nullable String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        return jsonMapper.readValue(json, DETAILS_TYPE);
    }
}
