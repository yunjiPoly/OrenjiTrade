package com.orenjitrade.api.profiles.domain;

/** {@code tag.status}: only {@link #ACTIVE} tags are searchable, selectable and shown. */
public enum TagStatus {
    ACTIVE,
    HIDDEN,
    BANNED
}
