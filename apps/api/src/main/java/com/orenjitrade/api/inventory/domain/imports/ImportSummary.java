package com.orenjitrade.api.inventory.domain.imports;

/**
 * The counts of a preview.
 *
 * @param rows every row
 * @param ready rows that will be imported: a card, a printing, not left out
 * @param toChoose rows that still need a printing (and are not left out)
 * @param unmatched rows that fit nothing in the catalog
 * @param leftOut matched rows the collector took out, or whose deck sections do not count
 * @param copies copies the ready rows add
 * @param items inventory items the ready rows write once equal rows are merged
 */
public record ImportSummary(
        int rows, int ready, int toChoose, int unmatched, int leftOut, long copies, int items) {}
