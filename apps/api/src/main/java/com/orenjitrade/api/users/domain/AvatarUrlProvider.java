package com.orenjitrade.api.users.domain;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Extension point: the profiles module provides the public avatar URL shown in {@code MeResponse}
 * and admin views. Without an implementation the URL is {@code null}.
 */
public interface AvatarUrlProvider {

    @Nullable String avatarUrlOf(UUID userId);
}
