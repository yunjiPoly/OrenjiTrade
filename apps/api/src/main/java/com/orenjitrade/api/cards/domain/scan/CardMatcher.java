package com.orenjitrade.api.cards.domain.scan;

/**
 * Finds the catalog printing of a scanned card (owner spec 2026-10-15, section 3.5). One interface
 * for every way of recognising a card: {@link TextCardMatcher} matches the name and the set code
 * the phone read; an image matcher (DINOv2, on hold) can implement it later behind the same
 * endpoint.
 */
public interface CardMatcher {

    /**
     * The card and printing the read points to, the printings to pick from, and the other cards it
     * could be.
     *
     * @throws com.orenjitrade.api.common.ApiException 400 VALIDATION_FAILED for a game the matcher
     *     does not read
     */
    ScanMatch match(ScanQuery query);
}
