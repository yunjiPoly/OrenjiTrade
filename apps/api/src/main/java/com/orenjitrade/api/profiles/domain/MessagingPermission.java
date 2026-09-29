package com.orenjitrade.api.profiles.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Who may start a private conversation with a collector. */
@Schema(name = "MessagingPermission")
public enum MessagingPermission {
    EVERYONE,
    /** Members who completed their own profile (default). */
    MEMBERS_WITH_PROFILE,
    NOBODY
}
