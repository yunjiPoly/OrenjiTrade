package com.orenjitrade.api.messaging.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Purpose of an image upload ({@code POST /uploads/images}). */
@Schema(name = "UploadKind")
public enum UploadKind {
    /** Attached to a private message within one hour. */
    MESSAGE,
    /**
     * Inventory photos: reserved; items keep their direct upload route {@code POST
     * /inventory/items/{id}/images} (400 until an inventory flow consumes uploads).
     */
    INVENTORY
}
