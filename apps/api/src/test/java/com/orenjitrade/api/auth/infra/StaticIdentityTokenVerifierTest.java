package com.orenjitrade.api.auth.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.auth.domain.InvalidIdentityTokenException;
import com.orenjitrade.api.auth.domain.VerifiedIdentity;
import com.orenjitrade.api.common.TimeProvider;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class StaticIdentityTokenVerifierTest {

    private static final Instant NOW = Instant.parse("2026-09-29T12:00:00Z");

    private final StaticIdentityTokenVerifier verifier =
            new StaticIdentityTokenVerifier(TimeProvider.fixed(NOW));

    @Test
    void uidOnlyTokenUsesDefaults() {
        VerifiedIdentity identity = verifier.verify("test-token:Alice");

        assertThat(identity.providerUid()).isEqualTo("Alice");
        assertThat(identity.email()).isEqualTo("alice@orenjitrade.test");
        assertThat(identity.emailVerified()).isTrue();
        assertThat(identity.authTime()).isEqualTo(NOW);
        assertThat(identity.secondFactorUsed()).isFalse();
        assertThat(identity.signInProvider()).isEqualTo("password");
        assertThat(identity.claims()).containsEntry("sub", "Alice");
        assertThat(identity.displayName()).isNull();
    }

    @Test
    void explicitEmailIsUsed() {
        VerifiedIdentity identity = verifier.verify("test-token:u1:someone@example.test");

        assertThat(identity.email()).isEqualTo("someone@example.test");
        assertThat(identity.emailVerified()).isTrue();
    }

    @Test
    void flagsAfterEmail() {
        VerifiedIdentity identity =
                verifier.verify("test-token:u1:someone@example.test:unverified,mfa,stale");

        assertThat(identity.email()).isEqualTo("someone@example.test");
        assertThat(identity.emailVerified()).isFalse();
        assertThat(identity.secondFactorUsed()).isTrue();
        assertThat(identity.authTime()).isEqualTo(NOW.minus(Duration.ofHours(1)));
    }

    @Test
    void flagsWithoutEmail() {
        VerifiedIdentity identity = verifier.verify("test-token:u1::mfa");

        assertThat(identity.email()).isEqualTo("u1@orenjitrade.test");
        assertThat(identity.secondFactorUsed()).isTrue();
        assertThat(identity.authTime()).isEqualTo(NOW);

        VerifiedIdentity shorthand = verifier.verify("test-token:u1:stale");
        assertThat(shorthand.email()).isEqualTo("u1@orenjitrade.test");
        assertThat(shorthand.authTime()).isEqualTo(NOW.minus(Duration.ofHours(1)));
    }

    @Test
    void tokenBuildersMatchTheGrammar() {
        assertThat(StaticIdentityTokenVerifier.token("u1")).isEqualTo("test-token:u1");
        assertThat(StaticIdentityTokenVerifier.token("u1", "mfa", "stale"))
                .isEqualTo("test-token:u1::mfa,stale");
        assertThat(
                        verifier.verify(StaticIdentityTokenVerifier.token("u1", "mfa"))
                                .secondFactorUsed())
                .isTrue();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "",
                "garbage",
                "Bearer test-token:u1",
                "test-token:",
                "test-token:has space",
                "test-token:u1::unknownflag",
                "test-token:u1:a@b.test:mfa:extra"
            })
    void rejectsAnythingElse(String token) {
        assertThatThrownBy(() -> verifier.verify(token))
                .isInstanceOf(InvalidIdentityTokenException.class)
                .hasMessageContaining("access token");
    }
}
