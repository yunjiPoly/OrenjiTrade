package com.orenjitrade.api.auth.infra;

import com.orenjitrade.api.auth.domain.IdentityTokenVerifier;
import com.orenjitrade.api.auth.domain.InvalidIdentityTokenException;
import com.orenjitrade.api.auth.domain.VerifiedIdentity;
import com.orenjitrade.api.common.TimeProvider;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Test-profile verifier (ADR 0008): accepts {@code test-token:<uid>[:<email>][:<flags>]} where
 * {@code flags} is a comma separated list of
 *
 * <ul>
 *   <li>{@code unverified}: the email is not verified
 *   <li>{@code mfa}: the session used a second factor
 *   <li>{@code stale}: {@code authTime} is one hour in the past (otherwise: now)
 * </ul>
 *
 * The email defaults to {@code <uid>@orenjitrade.test}. Anything else is rejected exactly like an
 * invalid Firebase token would be.
 */
@Component
@Profile("test")
public class StaticIdentityTokenVerifier implements IdentityTokenVerifier {

    public static final String PREFIX = "test-token:";
    public static final String FLAG_UNVERIFIED = "unverified";
    public static final String FLAG_MFA = "mfa";
    public static final String FLAG_STALE = "stale";
    public static final Duration STALE_AGE = Duration.ofHours(1);
    public static final String DEFAULT_EMAIL_DOMAIN = "orenjitrade.test";

    private static final Pattern UID = Pattern.compile("^[A-Za-z0-9_.-]{1,128}$");
    private static final Set<String> KNOWN_FLAGS = Set.of(FLAG_UNVERIFIED, FLAG_MFA, FLAG_STALE);

    private final TimeProvider timeProvider;

    public StaticIdentityTokenVerifier(TimeProvider timeProvider) {
        this.timeProvider = timeProvider;
    }

    /** Builds a token for {@code uid} with the default email and no flags. */
    public static String token(String uid) {
        return PREFIX + uid;
    }

    /** Builds a token with explicit flags, e.g. {@code token("alice", "mfa", "stale")}. */
    public static String token(String uid, String... flags) {
        return flags.length == 0 ? token(uid) : PREFIX + uid + "::" + String.join(",", flags);
    }

    @Override
    public VerifiedIdentity verify(String token) {
        if (!token.startsWith(PREFIX)) {
            throw new InvalidIdentityTokenException("The access token is invalid");
        }
        String[] parts = token.substring(PREFIX.length()).split(":", -1);
        if (parts.length == 0 || parts.length > 3 || !UID.matcher(parts[0]).matches()) {
            throw new InvalidIdentityTokenException("The access token is malformed");
        }
        String uid = parts[0];
        @Nullable String email = null;
        Set<String> flags = new HashSet<>();
        if (parts.length >= 2) {
            if (parts[1].contains("@")) {
                email = parts[1];
            } else if (!parts[1].isEmpty()) {
                flags.addAll(parseFlags(parts[1]));
            }
        }
        if (parts.length == 3) {
            flags.addAll(parseFlags(parts[2]));
        }
        if (email == null) {
            email = uid.toLowerCase(Locale.ROOT) + "@" + DEFAULT_EMAIL_DOMAIN;
        }
        Instant now = timeProvider.now();
        Instant authTime = flags.contains(FLAG_STALE) ? now.minus(STALE_AGE) : now;
        boolean mfa = flags.contains(FLAG_MFA);
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", uid);
        claims.put("email", email);
        claims.put("auth_time", authTime.getEpochSecond());
        claims.put("firebase", Map.of("sign_in_provider", "password"));
        return new VerifiedIdentity(
                uid, email, !flags.contains(FLAG_UNVERIFIED), authTime, "password", mfa, claims);
    }

    private static Set<String> parseFlags(String raw) {
        Set<String> flags = new HashSet<>();
        Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(flag -> !flag.isEmpty())
                .forEach(
                        flag -> {
                            String normalised = flag.toLowerCase(Locale.ROOT);
                            if (!KNOWN_FLAGS.contains(normalised)) {
                                throw new InvalidIdentityTokenException(
                                        "The access token is malformed");
                            }
                            flags.add(normalised);
                        });
        return flags;
    }
}
