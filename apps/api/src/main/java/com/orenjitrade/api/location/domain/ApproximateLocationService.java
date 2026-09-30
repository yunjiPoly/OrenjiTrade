package com.orenjitrade.api.location.domain;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Derives the public point of a trading area (ADR 0004), server side only:
 *
 * <ol>
 *   <li>snap the chosen centre to its ~1 km grid cell: {@code row = floor(lat / 0.009)}, {@code col
 *       = floor(lng / (0.009 / cos(row centre latitude)))};
 *   <li>offset inside the cell by a deterministic vector derived from {@code
 *       HMAC-SHA256(LOCATION_JITTER_SECRET, userId)}, keeping a {@value #MARGIN_DEG} degree margin
 *       from the cell edges;
 *   <li>round to 3 decimals (the margin guarantees the rounded point stays in the cell).
 * </ol>
 *
 * The same user always gets the same point for the same cell (no triangulation through repeated
 * queries); different users in the same cell get different points; the point reveals nothing finer
 * than the cell. Pure and thread-safe; never logs coordinates.
 */
public class ApproximateLocationService {

    /** Grid cell height in degrees of latitude (about 1 km). */
    public static final double CELL_DEG = 0.009;

    /** Distance kept from the cell edges so rounding to 3 decimals never leaves the cell. */
    static final double MARGIN_DEG = 0.001;

    /** Collectors may only pick trading areas between these latitudes (the grid needs cos > 0). */
    public static final double MAX_ABS_LAT = 85.0;

    private static final String HMAC = "HmacSHA256";

    private final SecretKeySpec key;
    private final RegionGeocoder geocoder;

    public ApproximateLocationService(String jitterSecret, RegionGeocoder geocoder) {
        if (jitterSecret.isBlank()) {
            throw new IllegalArgumentException("The location jitter secret must not be blank");
        }
        this.key = new SecretKeySpec(jitterSecret.getBytes(StandardCharsets.UTF_8), HMAC);
        this.geocoder = geocoder;
    }

    /** Public point, label and cell of a trading area centred on ({@code lat}, {@code lng}). */
    public DerivedLocation derive(UUID userId, double lat, double lng) {
        if (Double.isNaN(lat) || Math.abs(lat) > MAX_ABS_LAT) {
            throw new IllegalArgumentException("Latitude out of range");
        }
        double normalisedLng = GeoMath.normaliseLng(lng);
        GridCell cell = cellOf(lat, normalisedLng);
        double[] jitter = jitter(userId);
        double width = cellWidthDeg(cell.row());
        double publicLat = cell.south() + MARGIN_DEG + jitter[0] * (CELL_DEG - 2 * MARGIN_DEG);
        double publicLng = cell.west() + MARGIN_DEG + jitter[1] * (width - 2 * MARGIN_DEG);
        PublicPoint point = new PublicPoint(publicLat, GeoMath.normaliseLng(publicLng));
        return new DerivedLocation(point, geocoder.labelFor(point.lat(), point.lng()), cell);
    }

    /** The grid cell containing ({@code lat}, {@code lng}). */
    public static GridCell cellOf(double lat, double lng) {
        long row = (long) Math.floor(lat / CELL_DEG);
        long col = (long) Math.floor(lng / cellWidthDeg(row));
        return new GridCell(row, col);
    }

    /** Width in degrees of longitude of the cells of {@code row} (about 1 km on the ground). */
    public static double cellWidthDeg(long row) {
        double centreLat = (row + 0.5) * CELL_DEG;
        return CELL_DEG / Math.cos(Math.toRadians(centreLat));
    }

    /** Two uniform values in {@code [0, 1)} derived from the user id and the server secret. */
    double[] jitter(UUID userId) {
        byte[] digest;
        try {
            Mac mac = Mac.getInstance(HMAC);
            mac.init(key);
            digest =
                    mac.doFinal(
                            ByteBuffer.allocate(16)
                                    .putLong(userId.getMostSignificantBits())
                                    .putLong(userId.getLeastSignificantBits())
                                    .array());
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
        ByteBuffer buffer = ByteBuffer.wrap(digest);
        return new double[] {unit(buffer.getLong()), unit(buffer.getLong())};
    }

    private static double unit(long bits) {
        return (bits >>> 11) * 0x1.0p-53;
    }
}
