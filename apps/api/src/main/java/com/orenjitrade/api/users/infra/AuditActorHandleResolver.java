package com.orenjitrade.api.users.infra;

import com.orenjitrade.api.audit.domain.AuditActorResolver;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Users-module implementation of the audit module's actor lookup. */
@Component
public class AuditActorHandleResolver implements AuditActorResolver {

    private final UserAccountRepository repository;

    public AuditActorHandleResolver(UserAccountRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, String> handlesOf(Set<UUID> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, String> handles = new HashMap<>();
        repository
                .findHandlesByIdIn(userIds)
                .forEach(projection -> handles.put(projection.getId(), projection.getHandle()));
        return handles;
    }
}
