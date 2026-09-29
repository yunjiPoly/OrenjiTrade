package com.orenjitrade.api.binders.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** What a binder is for (presentation and filtering only). */
@Schema(name = "BinderKind")
public enum BinderKind {
    COLLECTION,
    TRADE,
    SALE,
    DECK,
    CUSTOM
}
