package com.orenjitrade.api.location.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** ADR 0004 public-point derivation: determinism, cell containment, per-user jitter, rounding. */
class ApproximateLocationServiceTest {

    private static final RegionGeocoder GEOCODER = (lat, lng) -> "Test area";
    private static final ApproximateLocationService SERVICE =
            new ApproximateLocationService("unit-test-secret", GEOCODER);
    private static final UUID ALICE = UUID.fromString("00000000-0000-4000-8000-00000000a11c");
    private static final UUID BOB = UUID.fromString("00000000-0000-4000-8000-000000000b0b");

    @Test
    void sameUserSameCentreGivesTheSamePointEveryTime() {
        DerivedLocation first = SERVICE.derive(ALICE, 45.5223, -73.5812);
        for (int i = 0; i < 20; i++) {
            assertThat(SERVICE.derive(ALICE, 45.5223, -73.5812)).isEqualTo(first);
        }
        // A fresh instance with the same secret derives the same point (no hidden state).
        assertThat(
                        new ApproximateLocationService("unit-test-secret", GEOCODER)
                                .derive(ALICE, 45.5223, -73.5812))
                .isEqualTo(first);
    }

    @Test
    void anyCentreInsideTheSameCellGivesTheSamePoint() {
        GridCell cell = ApproximateLocationService.cellOf(45.5223, -73.5812);
        DerivedLocation reference = SERVICE.derive(ALICE, 45.5223, -73.5812);
        Random random = new Random(42);
        for (int i = 0; i < 200; i++) {
            double lat = cell.south() + random.nextDouble() * (cell.north() - cell.south()) * 0.999;
            double lng = cell.west() + random.nextDouble() * (cell.east() - cell.west()) * 0.999;
            assertThat(SERVICE.derive(ALICE, lat, lng).publicPoint())
                    .isEqualTo(reference.publicPoint());
        }
    }

    @Test
    void publicPointStaysInTheCellOfTheCentreAndHasThreeDecimals() {
        Random random = new Random(7);
        for (int i = 0; i < 2_000; i++) {
            double lat = -84 + random.nextDouble() * 168;
            double lng = -180 + random.nextDouble() * 360;
            UUID user = new UUID(random.nextLong(), random.nextLong());
            DerivedLocation derived = SERVICE.derive(user, lat, lng);
            PublicPoint point = derived.publicPoint();
            GridCell centreCell = ApproximateLocationService.cellOf(lat, lng);
            assertThat(derived.cell()).isEqualTo(centreCell);
            assertThat(centreCell.contains(point.lat(), point.lng()))
                    .as("point %s must be inside cell %s", point, centreCell.id())
                    .isTrue();
            assertThat(ApproximateLocationService.cellOf(point.lat(), point.lng()))
                    .isEqualTo(centreCell);
            assertThat(decimals(point.lat())).isLessThanOrEqualTo(3);
            assertThat(decimals(point.lng())).isLessThanOrEqualTo(3);
        }
    }

    @Test
    void differentUsersInTheSameCellGetDifferentPoints() {
        assertThat(SERVICE.derive(ALICE, 45.5223, -73.5812).publicPoint())
                .isNotEqualTo(SERVICE.derive(BOB, 45.5223, -73.5812).publicPoint());
        Set<PublicPoint> points = new HashSet<>();
        for (int i = 0; i < 50; i++) {
            points.add(
                    SERVICE.derive(UUID.nameUUIDFromBytes(new byte[] {(byte) i}), 45.5, -73.6)
                            .publicPoint());
        }
        assertThat(points.size()).isGreaterThan(20);
    }

    @Test
    void theSecretChangesTheJitter() {
        ApproximateLocationService other =
                new ApproximateLocationService("another-secret", GEOCODER);
        assertThat(other.derive(ALICE, 45.5223, -73.5812).publicPoint())
                .isNotEqualTo(SERVICE.derive(ALICE, 45.5223, -73.5812).publicPoint());
    }

    @Test
    void publicPointNeverEqualsTheCentreExactlyByConstructionOfTheMargin() {
        // The point sits at least MARGIN_DEG - 0.0005 from the cell edges, whatever the centre.
        GridCell cell = ApproximateLocationService.cellOf(45.5, -73.6);
        PublicPoint point = SERVICE.derive(ALICE, cell.south(), cell.west()).publicPoint();
        assertThat(point.lat() - cell.south()).isGreaterThanOrEqualTo(0.0005);
        assertThat(cell.north() - point.lat()).isGreaterThanOrEqualTo(0.0005);
    }

    @Test
    void cellIdsAndWidthsFollowTheGrid() {
        GridCell cell = ApproximateLocationService.cellOf(45.522, -73.581);
        assertThat(cell.row()).isEqualTo((long) Math.floor(45.522 / 0.009));
        assertThat(cell.id()).isEqualTo("r" + cell.row() + "c" + cell.col());
        // ~1 km wide: 0.009 / cos(45.5 deg) ~= 0.0128 degrees of longitude.
        assertThat(ApproximateLocationService.cellWidthDeg(cell.row())).isBetween(0.0125, 0.0131);
    }

    @Test
    void rejectsPolarLatitudesAndBlankSecrets() {
        assertThatThrownBy(() -> SERVICE.derive(ALICE, 89.0, 0.0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ApproximateLocationService(" ", GEOCODER))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void distanceBucketsFollowTheContract() {
        assertThat(DistanceBucket.ofKm(0.2)).isEqualTo(DistanceBucket.LT_1KM);
        assertThat(DistanceBucket.ofKm(1.0)).isEqualTo(DistanceBucket.KM_1_5);
        assertThat(DistanceBucket.ofKm(4.9)).isEqualTo(DistanceBucket.KM_1_5);
        assertThat(DistanceBucket.ofKm(7)).isEqualTo(DistanceBucket.KM_5_10);
        assertThat(DistanceBucket.ofKm(24.9)).isEqualTo(DistanceBucket.KM_10_25);
        assertThat(DistanceBucket.ofKm(49.9)).isEqualTo(DistanceBucket.KM_25_50);
        assertThat(DistanceBucket.ofKm(50)).isEqualTo(DistanceBucket.GT_50KM);
        assertThat(DistanceBucket.ofKm(4_000)).isEqualTo(DistanceBucket.GT_50KM);
        // Plateau -> Verdun is about 7 km.
        assertThat(DistanceBucket.ofKm(GeoMath.distanceKm(45.522, -73.581, 45.458, -73.568)))
                .isEqualTo(DistanceBucket.KM_5_10);
    }

    @Test
    void roundingIsHalfUpToThreeDecimals() {
        assertThat(GeoMath.round3(45.52249)).isEqualTo(45.522);
        assertThat(GeoMath.round3(45.5225)).isEqualTo(45.523);
        assertThat(GeoMath.round3(-73.58149)).isEqualTo(-73.581);
        assertThat(new PublicPoint(45.123456, -73.987654))
                .isEqualTo(new PublicPoint(45.123, -73.988));
    }

    private static int decimals(double value) {
        return Math.max(0, BigDecimal.valueOf(value).stripTrailingZeros().scale());
    }
}
