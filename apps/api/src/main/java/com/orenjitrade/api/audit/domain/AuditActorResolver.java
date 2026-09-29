package com.orenjitrade.api.audit.domain;

import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Resolves actor user ids to handles for audit-log responses. Implemented by the users module so
 * the audit module never depends on it.
 */
public interface AuditActorResolver {

    /** Handles of the given users; ids without an account are simply absent from the result. */
    Map<UUID, String> handlesOf(Set<UUID> userIds);
}
