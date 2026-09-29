package com.orenjitrade.api.games.domain;

/** Visibility of a game ({@code game.status}). */
public enum GameStatus {
    /** Listed publicly; its cards are searchable; selectable on profiles. */
    ACTIVE,
    /** Kept for existing data but absent from public catalog endpoints and profile choices. */
    HIDDEN
}
