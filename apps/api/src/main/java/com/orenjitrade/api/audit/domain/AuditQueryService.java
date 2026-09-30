package com.orenjitrade.api.audit.domain;

import com.orenjitrade.api.audit.api.AuditActor;
import com.orenjitrade.api.audit.api.AuditLogEntry;
import com.orenjitrade.api.audit.infra.AuditLogRepository;
import com.orenjitrade.api.audit.infra.AuditLogSpecifications;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** Read side of the audit log (admin console). */
@Service
public class AuditQueryService {

    private static final TypeReference<Map<String, Object>> DETAILS_TYPE = new TypeReference<>() {};

    private final AuditLogRepository repository;
    private final ObjectProvider<AuditActorResolver> actorResolver;
    private final JsonMapper jsonMapper;

    public AuditQueryService(
            AuditLogRepository repository,
            ObjectProvider<AuditActorResolver> actorResolver,
            JsonMapper jsonMapper) {
        this.repository = repository;
        this.actorResolver = actorResolver;
        this.jsonMapper = jsonMapper;
    }

    @Transactional(readOnly = true)
    public Page<AuditLogEntry> search(AuditLogFilter filter, int page, int size) {
        PageRequest pageable =
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "occurredAt", "id"));
        Page<AuditLog> result =
                repository.findAll(AuditLogSpecifications.matching(filter), pageable);
        Map<UUID, String> handles = handlesOf(result.getContent());
        return result.map(entry -> toEntry(entry, handles));
    }

    /** The most recent entries targeting one object, newest first. */
    @Transactional(readOnly = true)
    public List<AuditLogEntry> recentForTarget(String targetType, String targetId, int limit) {
        List<AuditLog> entries =
                repository.findByTargetTypeAndTargetIdOrderByOccurredAtDesc(
                        targetType, targetId, PageRequest.of(0, limit));
        Map<UUID, String> handles = handlesOf(entries);
        return entries.stream().map(entry -> toEntry(entry, handles)).toList();
    }

    private Map<UUID, String> handlesOf(List<AuditLog> entries) {
        @Nullable AuditActorResolver resolver = actorResolver.getIfAvailable();
        if (resolver == null) {
            return Map.of();
        }
        Set<UUID> ids = new HashSet<>();
        for (AuditLog entry : entries) {
            if (entry.getActorUserId() != null) {
                ids.add(entry.getActorUserId());
            }
        }
        return ids.isEmpty() ? Map.of() : resolver.handlesOf(ids);
    }

    private AuditLogEntry toEntry(AuditLog entry, Map<UUID, String> handles) {
        @Nullable UUID actorId = entry.getActorUserId();
        AuditActor actor =
                new AuditActor(
                        actorId,
                        actorId == null ? null : handles.get(actorId),
                        entry.getActorType());
        return new AuditLogEntry(
                entry.getId(),
                entry.getOccurredAt(),
                actor,
                entry.getAction(),
                entry.getTargetType(),
                entry.getTargetId(),
                parseDetails(entry.getDetails()),
                entry.getRequestId());
    }

    private Map<String, Object> parseDetails(@Nullable String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        return jsonMapper.readValue(json, DETAILS_TYPE);
    }
}
