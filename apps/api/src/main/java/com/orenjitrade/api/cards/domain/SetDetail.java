package com.orenjitrade.api.cards.domain;

import com.orenjitrade.api.common.PageResponse;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Map;

/**
 * A set with its metadata and a page of its printings.
 *
 * @param set the set
 * @param metadata game-specific set attributes
 * @param printings printings by collector number
 */
@Schema(name = "SetDetail", description = "Card set with a page of its printings")
public record SetDetail(
        SetSummary set, Map<String, Object> metadata, PageResponse<PrintingSummary> printings) {}
