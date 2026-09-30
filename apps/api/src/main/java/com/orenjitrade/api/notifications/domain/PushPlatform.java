package com.orenjitrade.api.notifications.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Platform of a device push token. */
@Schema(name = "PushPlatform")
public enum PushPlatform {
    IOS,
    ANDROID,
    WEB
}
