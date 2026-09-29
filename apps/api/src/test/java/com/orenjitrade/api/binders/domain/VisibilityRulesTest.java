package com.orenjitrade.api.binders.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.profiles.domain.ProfileVisibility;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/** The pure form of the effective public visibility rules and the owner's visibility choices. */
class VisibilityRulesTest {

    static final Instant NOW = Instant.parse("2026-09-29T12:00:00Z");

    @Test
    void listingsNeedAPublicVisibilityNotExpiredAndNotHidden() {
        assertThat(
                        PublicVisibilityRules.isListed(
                                ListingVisibility.PUBLIC, null, FreshnessState.ACTIVE, NOW))
                .isTrue();
        assertThat(
                        PublicVisibilityRules.isListed(
                                ListingVisibility.PUBLIC, null, FreshnessState.STALE, NOW))
                .isTrue();
        assertThat(
                        PublicVisibilityRules.isListed(
                                ListingVisibility.PUBLIC, null, FreshnessState.HIDDEN, NOW))
                .isFalse();
        assertThat(
                        PublicVisibilityRules.isListed(
                                ListingVisibility.PRIVATE, null, FreshnessState.ACTIVE, NOW))
                .isFalse();
        assertThat(
                        PublicVisibilityRules.isListed(
                                ListingVisibility.TEMPORARILY_PUBLIC,
                                NOW.plusSeconds(1),
                                FreshnessState.AGING,
                                NOW))
                .isTrue();
        assertThat(
                        PublicVisibilityRules.isListed(
                                ListingVisibility.TEMPORARILY_PUBLIC,
                                NOW,
                                FreshnessState.ACTIVE,
                                NOW))
                .as("expired at its end")
                .isFalse();
        assertThat(
                        PublicVisibilityRules.isListed(
                                ListingVisibility.TEMPORARILY_PUBLIC,
                                null,
                                FreshnessState.ACTIVE,
                                NOW))
                .isFalse();
    }

    @Test
    void ownersMustBeActiveAndDiscoverableOrPublicButNeverPrivate() {
        assertThat(
                        PublicVisibilityRules.isOwnerListed(
                                AccountStatus.ACTIVE, null, true, ProfileVisibility.MEMBERS, NOW))
                .isTrue();
        assertThat(
                        PublicVisibilityRules.isOwnerListed(
                                AccountStatus.ACTIVE, null, false, ProfileVisibility.PUBLIC, NOW))
                .isTrue();
        assertThat(
                        PublicVisibilityRules.isOwnerListed(
                                AccountStatus.ACTIVE, null, false, ProfileVisibility.MEMBERS, NOW))
                .isFalse();
        assertThat(
                        PublicVisibilityRules.isOwnerListed(
                                AccountStatus.ACTIVE, null, true, ProfileVisibility.PRIVATE, NOW))
                .isFalse();
        assertThat(
                        PublicVisibilityRules.isOwnerListed(
                                AccountStatus.SUSPENDED,
                                NOW.plus(Duration.ofDays(1)),
                                true,
                                ProfileVisibility.PUBLIC,
                                NOW))
                .isFalse();
        assertThat(
                        PublicVisibilityRules.isOwnerListed(
                                AccountStatus.SUSPENDED, null, true, ProfileVisibility.PUBLIC, NOW))
                .as("indefinite suspension")
                .isFalse();
        assertThat(
                        PublicVisibilityRules.isOwnerListed(
                                AccountStatus.SUSPENDED,
                                NOW.minusSeconds(1),
                                true,
                                ProfileVisibility.PUBLIC,
                                NOW))
                .as("suspension already over")
                .isTrue();
        for (AccountStatus gone :
                new AccountStatus[] {AccountStatus.DELETION_REQUESTED, AccountStatus.DELETED}) {
            assertThat(
                            PublicVisibilityRules.isOwnerListed(
                                    gone, null, true, ProfileVisibility.PUBLIC, NOW))
                    .as(gone.name())
                    .isFalse();
        }
    }

    @Test
    void itemsNeedTheirOwnRuleTheirBinderAndTheirOwner() {
        assertThat(PublicVisibilityRules.isItemPublic(true, null, true)).isTrue();
        assertThat(PublicVisibilityRules.isItemPublic(true, true, true)).isTrue();
        assertThat(PublicVisibilityRules.isItemPublic(true, false, true)).isFalse();
        assertThat(PublicVisibilityRules.isItemPublic(false, true, true)).isFalse();
        assertThat(PublicVisibilityRules.isItemPublic(true, true, false)).isFalse();
        assertThat(PublicVisibilityRules.isItemPublic(true, null, false)).isFalse();
    }

    @Test
    void temporaryPublicationsNeedAnEndWithinThirtyDays() {
        assertThat(PublicVisibilityRules.validatePublicUntil(ListingVisibility.PUBLIC, null, NOW))
                .isEmpty();
        assertThat(
                        PublicVisibilityRules.validatePublicUntil(
                                ListingVisibility.PRIVATE, NOW.minusSeconds(5), NOW))
                .as("ignored for other visibilities")
                .isEmpty();
        assertThat(
                        PublicVisibilityRules.validatePublicUntil(
                                ListingVisibility.TEMPORARILY_PUBLIC, null, NOW))
                .extracting(ProblemFieldError::field)
                .containsExactly("publicUntil");
        assertThat(
                        PublicVisibilityRules.validatePublicUntil(
                                ListingVisibility.TEMPORARILY_PUBLIC, NOW, NOW))
                .hasSize(1);
        assertThat(
                        PublicVisibilityRules.validatePublicUntil(
                                ListingVisibility.TEMPORARILY_PUBLIC,
                                NOW.plus(Duration.ofDays(30)),
                                NOW))
                .isEmpty();
        assertThat(
                        PublicVisibilityRules.validatePublicUntil(
                                ListingVisibility.TEMPORARILY_PUBLIC,
                                NOW.plus(Duration.ofDays(30)).plusSeconds(1),
                                NOW))
                .hasSize(1);
        assertThat(PublicVisibilityRules.storedPublicUntil(ListingVisibility.PUBLIC, NOW)).isNull();
        assertThat(
                        PublicVisibilityRules.storedPublicUntil(
                                ListingVisibility.TEMPORARILY_PUBLIC, NOW))
                .isEqualTo(NOW);
    }

    @Test
    void publishModesMapToVisibilityAndEnd() {
        assertThat(PublishMode.PUBLIC.visibility()).isEqualTo(ListingVisibility.PUBLIC);
        assertThat(PublishMode.PUBLIC.publicUntil(NOW)).isNull();
        assertThat(PublishMode.UNTIL_DISABLED.visibility()).isEqualTo(ListingVisibility.PUBLIC);
        assertThat(PublishMode.UNTIL_DISABLED.publicUntil(NOW)).isNull();
        assertThat(PublishMode.ONE_HOUR.visibility())
                .isEqualTo(ListingVisibility.TEMPORARILY_PUBLIC);
        assertThat(PublishMode.ONE_HOUR.publicUntil(NOW)).isEqualTo(NOW.plus(Duration.ofHours(1)));
        assertThat(PublishMode.ONE_DAY.publicUntil(NOW)).isEqualTo(NOW.plus(Duration.ofDays(1)));
    }
}
