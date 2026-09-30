package com.orenjitrade.api.audit.domain;

import com.orenjitrade.api.audit.infra.AuditLogRepository;
import com.orenjitrade.api.common.RequestIdFilter;
import com.orenjitrade.api.common.TimeProvider;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Writes audit entries. {@link #record} joins the caller's transaction so an audit row is committed
 * exactly when the audited change is; the request id is read from the MDC (put there by {@link
 * RequestIdFilter}).
 */
@Service
public class AuditService {

    /** {@code target_type} for user accounts. */
    public static final String TARGET_USER = "USER";

    private final AuditLogRepository repository;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public AuditService(
            AuditLogRepository repository, TimeProvider timeProvider, JsonMapper jsonMapper) {
        this.repository = repository;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
    }

    /**
     * Records an action. Participates in the surrounding transaction (creates one when none is
     * active).
     *
     * @param actorType who acted
     * @param actorUserId the acting account, {@code null} for {@link ActorType#SYSTEM}
     * @param action dotted action name, e.g. {@code user.suspend}
     * @param targetType e.g. {@link #TARGET_USER}
     * @param targetId identifier of the target, as text
     * @param details structured, PII-free details (never coordinates); serialised to JSON
     * @return the id of the new entry
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public UUID record(
            ActorType actorType,
            @Nullable UUID actorUserId,
            String action,
            String targetType,
            @Nullable String targetId,
            Map<String, ?> details) {
        UUID id = UUID.randomUUID();
        repository.save(
                new AuditLog(
                        id,
                        timeProvider.now(),
                        actorType,
                        actorUserId,
                        action,
                        targetType,
                        targetId,
                        details.isEmpty() ? null : jsonMapper.writeValueAsString(details),
                        MDC.get(RequestIdFilter.MDC_KEY)));
        return id;
    }
}
