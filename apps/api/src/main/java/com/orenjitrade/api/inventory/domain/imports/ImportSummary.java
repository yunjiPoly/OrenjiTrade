package com.orenjitrade.api.inventory.domain.imports;

import org.jspecify.annotations.Nullable;

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
 * @param mergedItems of {@code items}, those that are equal to an item the collector already has
 *     (same printing, condition, edition and language): the commit raises that item, the others are
 *     new
 * @param defaultConditions matched rows whose condition nobody chose: the file names none and the
 *     collector has not set one for the row
 * @param defaultCondition the condition those rows have when they all have the same one (the lowest
 *     grade of the game until a bulk action sets another); {@code null} when there is no such row
 *     or they differ
 * @param deckMain YDK: copies the file holds in the main deck, whatever counts (0 for a CSV)
 * @param deckExtra YDK: copies the file holds in the extra deck
 * @param deckSide YDK: copies the file holds in the side deck
 */
public record ImportSummary(
        int rows,
        int ready,
        int toChoose,
        int unmatched,
        int leftOut,
        long copies,
        int items,
        int mergedItems,
        int defaultConditions,
        @Nullable String defaultCondition,
        long deckMain,
        long deckExtra,
        long deckSide) {}
