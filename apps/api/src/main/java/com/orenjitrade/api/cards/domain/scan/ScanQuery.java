package com.orenjitrade.api.cards.domain.scan;

import java.util.List;

/**
 * What the phone read on one photo, best first (owner spec 2026-10-15, section 3.5).
 *
 * @param game game slug (only {@code yugioh} is read)
 * @param codes 0 to 3 printing code candidates as read
 * @param names 0 to 3 name candidates as read
 */
public record ScanQuery(String game, List<String> codes, List<String> names) {

    public ScanQuery {
        codes = List.copyOf(codes);
        names = List.copyOf(names);
    }
}
