package com.orenjitrade.api.inventory.domain.imports;

/**
 * An import preview with its counts.
 *
 * @param record the preview
 * @param summary its counts
 */
public record ImportView(ImportRecord record, ImportSummary summary) {}
