package com.orenjitrade.api.notifications.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.notifications.infra.PushTokenRepository;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Device push tokens ({@code POST /me/push-tokens}, {@code DELETE /me/push-tokens/{token}}):
 * idempotent registration (a token belongs to the account that registered it last), removal of the
 * caller's own tokens only, invalidation of tokens the push provider rejects. Token values are
 * never returned or logged.
 */
@Service
public class PushTokenService {

    /** Tokens used per push (most recently seen devices first). */
    public static final int MAX_DEVICES = 20;

    public static final int TOKEN_MAX = 4096;

    /** Printable ASCII without spaces (FCM, APNs and Expo tokens). */
    static final Pattern TOKEN = Pattern.compile("^[\\x21-\\x7E]{1," + TOKEN_MAX + "}$");

    private final PushTokenRepository repository;
    private final TimeProvider timeProvider;

    public PushTokenService(PushTokenRepository repository, TimeProvider timeProvider) {
        this.repository = repository;
        this.timeProvider = timeProvider;
    }

    @Transactional
    public void register(UUID userId, PushPlatform platform, String token) {
        repository.upsert(userId, platform.name(), validToken(token), timeProvider.now());
    }

    /** Removes one of the caller's tokens; unknown tokens and other accounts' tokens are no-ops. */
    @Transactional
    public void unregister(UUID userId, String token) {
        repository.delete(userId, token.trim());
    }

    @Transactional(readOnly = true)
    public List<String> activeTokens(UUID userId) {
        return repository.activeTokens(userId, MAX_DEVICES);
    }

    @Transactional
    public int invalidate(Collection<String> tokens) {
        return repository.markInvalid(tokens, timeProvider.now());
    }

    /** Export: platforms and dates, never the token values. */
    @Transactional(readOnly = true)
    public List<Map<String, @Nullable Object>> export(UUID userId) {
        return repository.summaries(userId).stream()
                .map(
                        row -> {
                            Map<String, @Nullable Object> entry = new LinkedHashMap<>();
                            entry.put("platform", row.get("platform"));
                            entry.put("createdAt", row.get("created_at"));
                            entry.put("lastSeenAt", row.get("last_seen_at"));
                            entry.put("invalidAt", row.get("invalid_at"));
                            return entry;
                        })
                .toList();
    }

    @Transactional
    public void purge(UUID userId) {
        repository.deleteByUser(userId);
    }

    private static String validToken(@Nullable String token) {
        String value = token == null ? "" : token.trim();
        if (!TOKEN.matcher(value).matches()) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    "token",
                                    "must be 1 to "
                                            + TOKEN_MAX
                                            + " printable characters without spaces")));
        }
        return value;
    }
}
