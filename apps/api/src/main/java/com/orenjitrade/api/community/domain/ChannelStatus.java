package com.orenjitrade.api.community.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Lifecycle of a community channel: ARCHIVED channels are hidden from members and read-only. */
@Schema(name = "CommunityChannelStatus")
public enum ChannelStatus {
    ACTIVE,
    ARCHIVED
}
