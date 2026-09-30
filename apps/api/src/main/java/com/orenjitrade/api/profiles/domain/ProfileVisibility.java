package com.orenjitrade.api.profiles.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Who may open a collector's profile. */
@Schema(name = "ProfileVisibility")
public enum ProfileVisibility {
    /** Anyone, including signed-out visitors of public pages. */
    PUBLIC,
    /** Signed-in members only (default). */
    MEMBERS,
    /** Nobody but the owner. */
    PRIVATE
}
