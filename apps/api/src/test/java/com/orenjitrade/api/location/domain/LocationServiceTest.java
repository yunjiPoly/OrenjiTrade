package com.orenjitrade.api.location.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.cache.RedisJsonCache;
import com.orenjitrade.api.location.events.LocationChangedEvent;
import com.orenjitrade.api.location.events.LocationRemovedEvent;
import com.orenjitrade.api.location.infra.RegionRepository;
import com.orenjitrade.api.location.infra.UserLocationRepository;
import com.orenjitrade.api.moderation.domain.ModerationScope;
import com.orenjitrade.api.moderation.domain.ModerationVerdict;
import com.orenjitrade.api.moderation.domain.TextModerationService;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;

/**
 * The self-declared location (ADR 0017) without a database: country and subdivision validated
 * against the region lists, the optional city trimmed, length-checked, refused when it looks like a
 * coordinate and moderated like profile text, and the city only ever leaving through the owner's
 * reads and their profile.
 */
class LocationServiceTest {

    private static final UUID USER = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-10-08T12:00:00Z");

    private final UserLocationRepository repository = mock(UserLocationRepository.class);
    private final RegionRepository regionRepository = mock(RegionRepository.class);
    private final RedisJsonCache cache = mock(RedisJsonCache.class);
    private final TextModerationService moderation = mock(TextModerationService.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);

    @SuppressWarnings("unchecked")
    private final ObjectProvider<DiscoverabilityPolicy> policy = mock(ObjectProvider.class);

    private LocationService service;

    @BeforeEach
    void setUp() {
        when(regionRepository.findAll()).thenReturn(RegionFixtures.REGIONS);
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
        when(moderation.evaluate(eq(ModerationScope.PROFILE), anyString()))
                .thenReturn(ModerationVerdict.ALLOW);
        RegionCatalog regions =
                new RegionCatalog(
                        regionRepository,
                        cache,
                        mock(AuditService.class),
                        TimeProvider.fixed(NOW),
                        events);
        service =
                new LocationService(
                        repository, regions, moderation, policy, TimeProvider.fixed(NOW), events);
    }

    private static StoredLocation stored(@Nullable String city, boolean showCity) {
        return new StoredLocation(
                USER,
                new PublicPlace("americas-north", "CA", "Canada", "CA-QC", "Quebec", false),
                city,
                showCity,
                NOW);
    }

    private static List<ProblemFieldError> fieldErrors(Runnable call) {
        List<ProblemFieldError> errors = new ArrayList<>();
        assertThatThrownBy(call::run)
                .isInstanceOfSatisfying(
                        ApiException.class,
                        problem -> {
                            assertThat(problem.getErrorCode())
                                    .isEqualTo(ErrorCode.VALIDATION_FAILED);
                            errors.addAll(problem.getFieldErrors());
                        });
        return errors;
    }

    private void assertNothingStored() {
        verify(repository, never()).upsert(any(), any(), any(), any(), anyBoolean(), any());
        verify(events, never()).publishEvent(any(LocationChangedEvent.class));
    }

    @Test
    void savesNormalisedCodesATrimmedCityAndShowsTheCityByDefault() {
        when(repository.find(USER)).thenReturn(Optional.of(stored("Saint John's", true)));

        MyLocationView mine = service.setMine(USER, " ca ", "ca-qc", "  Saint   John's ", null);

        verify(repository).upsert(USER, "CA", "CA-QC", "Saint John's", true, NOW);
        verify(events)
                .publishEvent(new LocationChangedEvent(USER, "americas-north", "CA", "CA-QC", NOW));
        assertThat(mine.city()).isEqualTo("Saint John's");
        assertThat(mine.showCity()).isTrue();
    }

    @Test
    void aBlankCityIsNoCityAndShowCityIsKeptAsSent() {
        when(repository.find(USER)).thenReturn(Optional.of(stored(null, false)));

        service.setMine(USER, "FR", "FR-IDF", "   ", false);

        verify(repository).upsert(USER, "FR", "FR-IDF", null, false, NOW);
        verifyNoInteractions(moderation);
    }

    @Test
    void aWholeCountryPseudoSubdivisionIsAccepted() {
        when(repository.find(USER)).thenReturn(Optional.empty());

        service.setMine(USER, "PR", "PR", null, true);

        verify(repository).upsert(USER, "PR", "PR", null, true, NOW);
    }

    @Test
    void countryAndSubdivisionAreRequired() {
        assertThat(fieldErrors(() -> service.setMine(USER, null, " ", null, true)))
                .containsExactly(
                        new ProblemFieldError("countryCode", "must not be blank"),
                        new ProblemFieldError("subdivisionCode", "must not be blank"));
        assertNothingStored();
    }

    @Test
    void unknownInactiveAndMismatchedCodesAreRefused() {
        assertThat(fieldErrors(() -> service.setMine(USER, "ZZ", "ZZ-1", null, true)))
                .containsExactly(new ProblemFieldError("countryCode", "unknown country"));
        // Switched off by an admin: no longer selectable.
        assertThat(fieldErrors(() -> service.setMine(USER, "GL", "GL", null, true)))
                .containsExactly(new ProblemFieldError("countryCode", "unknown country"));
        // A real subdivision of another country.
        assertThat(fieldErrors(() -> service.setMine(USER, "CA", "FR-IDF", null, true)))
                .containsExactly(
                        new ProblemFieldError(
                                "subdivisionCode", "unknown state or province for this country"));
        assertThat(fieldErrors(() -> service.setMine(USER, "CA", "CA-ZZ", null, true)))
                .extracting(ProblemFieldError::field)
                .containsExactly("subdivisionCode");
        assertNothingStored();
    }

    @Test
    void theCityIsAtMost80Characters() {
        String eighty = "Saint-" + "a".repeat(74);
        when(repository.find(USER)).thenReturn(Optional.empty());
        service.setMine(USER, "CA", "CA-QC", eighty, true);
        verify(repository).upsert(USER, "CA", "CA-QC", eighty, true, NOW);

        assertThat(fieldErrors(() -> service.setMine(USER, "CA", "CA-QC", eighty + "b", true)))
                .containsExactly(new ProblemFieldError("city", "must be at most 80 characters"));
    }

    @Test
    void theCityAcceptsPlaceNamesButNeverCoordinatesOrMarkup() {
        when(repository.find(USER)).thenReturn(Optional.empty());
        for (String city : List.of("Montréal", "St. John's", "Trois-Rivières", "Évry (91)")) {
            service.setMine(USER, "CA", "CA-QC", city, true);
            verify(repository).upsert(USER, "CA", "CA-QC", city, true, NOW);
        }
        for (String city :
                List.of("45.5017, -73.5673", "45,50 N", "Laval 45.55", "<b>Laval</b>", "a@b.c")) {
            assertThat(fieldErrors(() -> service.setMine(USER, "CA", "CA-QC", city, true)))
                    .as(city)
                    .extracting(ProblemFieldError::field)
                    .containsExactly("city");
        }
    }

    @Test
    void theCityIsModeratedLikeProfileText() {
        when(moderation.evaluate(ModerationScope.PROFILE, "Blockedtown"))
                .thenReturn(ModerationVerdict.BLOCK);
        assertThat(fieldErrors(() -> service.setMine(USER, "CA", "CA-QC", "Blockedtown", true)))
                .containsExactly(
                        new ProblemFieldError("city", "contains a term that is not allowed"));
        assertNothingStored();

        // Flagged text is accepted (and logged without the text).
        when(moderation.evaluate(ModerationScope.PROFILE, "Flaggedville"))
                .thenReturn(ModerationVerdict.FLAG);
        when(repository.find(USER)).thenReturn(Optional.empty());
        service.setMine(USER, "CA", "CA-QC", "Flaggedville", true);
        verify(repository).upsert(USER, "CA", "CA-QC", "Flaggedville", true, NOW);
    }

    @Test
    void theProfileShowsTheCityOnlyWhileTheOwnerShowsIt() {
        when(repository.find(USER)).thenReturn(Optional.of(stored("Laval", true)));
        assertThat(service.profileCityOf(USER)).contains("Laval");

        when(repository.find(USER)).thenReturn(Optional.of(stored("Laval", false)));
        assertThat(service.profileCityOf(USER)).isEmpty();
        // Everything else only gets the state/province and the country.
        assertThat(service.publicPlaceOf(USER).orElseThrow().label()).isEqualTo("Quebec, Canada");
        assertThat(service.labelOf(USER)).contains("Quebec, Canada");
        assertThat(service.publicPlaceOf(USER).orElseThrow().toString()).doesNotContain("Laval");
        assertThat(stored("Laval", true).toString()).doesNotContain("Laval");

        when(repository.find(USER)).thenReturn(Optional.of(stored(null, true)));
        assertThat(service.profileCityOf(USER)).isEmpty();
    }

    @Test
    void withoutALocationNothingIsShownAndNobodyIsDiscoverable() {
        when(repository.find(USER)).thenReturn(Optional.empty());
        when(policy.getIfAvailable()).thenReturn(null);

        MyLocationView mine = service.getMine(USER);

        assertThat(mine.place()).isNull();
        assertThat(mine.city()).isNull();
        assertThat(mine.showCity()).isTrue();
        assertThat(mine.discoverable()).isFalse();
        assertThat(service.homeRegionOf(USER)).isEmpty();
    }

    @Test
    void removingTheLocationAnnouncesItOnlyWhenThereWasOne() {
        when(repository.delete(USER)).thenReturn(1, 0);

        service.deleteMine(USER);
        service.deleteMine(USER);

        verify(events).publishEvent(new LocationRemovedEvent(USER, NOW));
    }
}
