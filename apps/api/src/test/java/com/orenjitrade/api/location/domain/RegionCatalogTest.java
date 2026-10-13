package com.orenjitrade.api.location.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.cache.RedisJsonCache;
import com.orenjitrade.api.location.events.RegionsChangedEvent;
import com.orenjitrade.api.location.infra.RegionRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;

/**
 * Validation of the platform region, country and subdivision codes clients send (ADR 0017), and the
 * audited admin move of a country to another region. Pure unit test: the lists come from {@link
 * RegionFixtures} through a pass-through cache.
 */
class RegionCatalogTest {

    private static final Instant NOW = Instant.parse("2026-10-08T12:00:00Z");

    private final RegionRepository repository = mock(RegionRepository.class);
    private final RedisJsonCache cache = mock(RedisJsonCache.class);
    private final AuditService audit = mock(AuditService.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final RegionCatalog catalog =
            new RegionCatalog(repository, cache, audit, TimeProvider.fixed(NOW), events);

    @BeforeEach
    void lists() {
        when(repository.findAll()).thenReturn(RegionFixtures.REGIONS);
        when(cache.get(
                        anyString(),
                        eq(RegionCatalog.RegionSnapshot.class),
                        any(Duration.class),
                        any()))
                .thenAnswer(
                        invocation ->
                                invocation
                                        .<Supplier<RegionCatalog.RegionSnapshot>>getArgument(3)
                                        .get());
    }

    private static AuthenticatedUser admin() {
        return new AuthenticatedUser(
                UUID.randomUUID(),
                "admin-uid",
                null,
                true,
                "admin",
                Set.of(Role.USER, Role.ADMIN),
                AccountStatus.ACTIVE,
                null,
                NOW,
                true);
    }

    private static void assertValidation(Runnable call, String field, String messagePart) {
        assertThatThrownBy(call::run)
                .isInstanceOfSatisfying(
                        ApiException.class,
                        problem -> {
                            assertThat(problem.getErrorCode())
                                    .isEqualTo(ErrorCode.VALIDATION_FAILED);
                            assertThat(problem.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                            assertThat(problem.getFieldErrors())
                                    .extracting(ProblemFieldError::field)
                                    .containsExactly(field);
                            assertThat(problem.getFieldErrors().getFirst().message())
                                    .contains(messagePart);
                        });
    }

    @Test
    void theRequestedRegionWinsAndIsNormalised() {
        assertThat(catalog.resolve("europe", "americas-north").code()).isEqualTo("europe");
        assertThat(catalog.resolve("  Americas-South ", null).code()).isEqualTo("americas-south");
    }

    @Test
    void withoutARequestedRegionTheHomeRegionThenTheDefaultApplies() {
        assertThat(catalog.resolve(null, "europe").code()).isEqualTo("europe");
        assertThat(catalog.resolve("  ", "americas-south").code()).isEqualTo("americas-south");
        // A stale home region (no longer in the lists) falls back to the default.
        assertThat(catalog.resolve(null, "asia").code()).isEqualTo("americas-north");
        assertThat(catalog.resolve(null, null).code()).isEqualTo("americas-north");
        assertThat(catalog.defaultRegion().name()).isEqualTo("Americas (North)");
    }

    @Test
    void anUnknownRegionIsA400NamingTheField() {
        assertValidation(() -> catalog.resolve("asia", "europe"), "region", "unknown region");
        assertValidation(
                () -> catalog.resolve("45.50,-73.56", null),
                "region",
                "americas-north, americas-south, europe");
        assertValidation(
                () -> catalog.requireRegion("mars", "regionCode"), "regionCode", "unknown region");
    }

    @Test
    void aSubdivisionBelongsToExactlyOneCountry() {
        assertThat(catalog.country("CA")).contains(RegionFixtures.CANADA);
        assertThat(catalog.country("ca")).isEmpty(); // callers normalise first
        assertThat(catalog.country("ZZ")).isEmpty();

        assertThat(catalog.subdivision("CA", "CA-QC"))
                .map(SubdivisionView::name)
                .contains("Quebec");
        assertThat(catalog.subdivision("FR", "CA-QC")).isEmpty();
        assertThat(catalog.subdivision("CA", "CA-ZZ")).isEmpty();
        assertThat(catalog.subdivision("ZZ", "CA-QC")).isEmpty();
        assertThat(catalog.subdivision("PR", "PR"))
                .map(SubdivisionView::wholeCountry)
                .contains(true);

        assertThat(catalog.countryOfSubdivision("FR-IDF")).contains(RegionFixtures.FRANCE);
        assertThat(catalog.countryOfSubdivision("XX-1")).isEmpty();
    }

    @Test
    void regionsListTheirCountriesInactiveOnesIncluded() {
        assertThat(catalog.regions())
                .extracting(RegionView::code)
                .containsExactly("americas-north", "americas-south", "europe");
        assertThat(catalog.region("americas-north").orElseThrow().countries())
                .extracting(CountryView::code)
                .containsExactly("CA", "PR", "GL");
        assertThat(catalog.country("GL").orElseThrow().active()).isFalse();
    }

    @Test
    void anAdminMovesACountryAuditedAndTheCacheIsDropped() {
        AuthenticatedUser actor = admin();
        when(repository.updateCountry("CA", "europe", true, actor.userId(), NOW)).thenReturn(true);

        CountryView moved = catalog.updateCountry(actor, " ca ", "Europe", true);

        assertThat(moved.code()).isEqualTo("CA");
        assertThat(moved.regionCode()).isEqualTo("europe");
        assertThat(moved.subdivisions()).isEqualTo(RegionFixtures.CANADA.subdivisions());
        verify(audit)
                .record(
                        ActorType.ADMIN,
                        actor.userId(),
                        RegionCatalog.ACTION_UPDATE_COUNTRY,
                        RegionCatalog.TARGET_COUNTRY,
                        "CA",
                        Map.of(
                                "country", "CA",
                                "previousRegion", "americas-north",
                                "region", "europe",
                                "previousActive", true,
                                "active", true));
        verify(cache).evict(RegionCatalog.CACHE_KEY);
        verify(events).publishEvent(new RegionsChangedEvent("CA", NOW));
    }

    @Test
    void movingAnUnknownCountryOrToAnUnknownRegionChangesNothing() {
        AuthenticatedUser actor = admin();
        assertThatThrownBy(() -> catalog.updateCountry(actor, "ZZ", "europe", true))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        problem -> assertThat(problem.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
        assertValidation(
                () -> catalog.updateCountry(actor, "CA", "asia", true),
                "regionCode",
                "unknown region");
        verify(repository, never())
                .updateCountry(anyString(), anyString(), eq(true), any(UUID.class), any());
        verifyNoInteractions(audit, events);
    }
}
