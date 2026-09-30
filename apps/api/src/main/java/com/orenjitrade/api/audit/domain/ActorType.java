package com.orenjitrade.api.audit.domain;

/** Who performed an audited action ({@code audit_log.actor_type}). */
public enum ActorType {
    /** A collector acting on their own account (e.g. consent, deletion request). */
    USER,
    /** An administrator or moderator acting on somebody else's data. */
    ADMIN,
    /** A job or the application itself (e.g. suspension expiry, deletion job). */
    SYSTEM
}
