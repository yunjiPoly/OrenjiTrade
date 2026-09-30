package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.billing.domain.LimitDecision;
import com.orenjitrade.api.billing.domain.LimitReachedException;
import com.orenjitrade.api.billing.domain.Limits;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.location.domain.SearchCentre;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/**
 * Resolves where a search looks (ADR 0004: "the requester's search centre is their own trading-area
 * centre or a client-supplied centre"): {@code lat}/{@code lng} when given, else the signed-in
 * caller's own trading area (never stored, never another collector's), always snapped to 0.01°.
 * Signed-out callers must pass a centre where the search is geographic. The radius is checked
 * against the caller's plan cap {@code map.radius.max_km} (signed-out callers: the FREE plan): an
 * explicit radius beyond it is {@code 429 LIMIT_REACHED}, the default radius is lowered to it.
 */
@Component
public class GeoScopeResolver {

    /** The plan cap of the map radius (ADR 0014, {@code usage_limit}). */
    public static final String RADIUS_LIMIT = "map.radius.max_km";

    /**
     * Input sanity bound (half the Earth's circumference), not a business rule: any plan cap is
     * lower and answers 429 first; only an unlimited entitlement gets this far.
     */
    static final double MAX_RADIUS_INPUT_KM = 20_000;

    private final LocationService locationService;
    private final Limits limits;
    private final SearchProperties properties;

    public GeoScopeResolver(
            LocationService locationService, Limits limits, SearchProperties properties) {
        this.locationService = locationService;
        this.limits = limits;
        this.properties = properties;
    }

    /**
     * @param centreRequired whether the search needs a centre (400 when none can be found)
     * @throws ApiException 400 for a partial or out-of-range centre or radius, or a missing centre
     * @throws LimitReachedException 429 when {@code radiusKm} exceeds the caller's plan
     */
    public GeoScope resolve(
            @Nullable UUID viewerId,
            @Nullable Double lat,
            @Nullable Double lng,
            @Nullable Double radiusKm,
            boolean centreRequired) {
        List<ProblemFieldError> errors = new ArrayList<>();
        if (lat != null && lng == null) {
            errors.add(new ProblemFieldError("lng", "is required with lat"));
        }
        if (lng != null && lat == null) {
            errors.add(new ProblemFieldError("lat", "is required with lng"));
        }
        if (lat != null && (lat.isNaN() || lat < -90 || lat > 90)) {
            errors.add(new ProblemFieldError("lat", "must be between -90 and 90"));
        }
        if (lng != null && (lng.isNaN() || lng < -180 || lng > 180)) {
            errors.add(new ProblemFieldError("lng", "must be between -180 and 180"));
        }
        if (radiusKm != null
                && (radiusKm.isNaN() || radiusKm < 0.1 || radiusKm > MAX_RADIUS_INPUT_KM)) {
            errors.add(
                    new ProblemFieldError(
                            "radiusKm", "must be between 0.1 and " + (int) MAX_RADIUS_INPUT_KM));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        @Nullable SearchCentre centre = null;
        if (lat != null && lng != null) {
            centre = SearchCentre.snap(lat, lng);
        } else if (viewerId != null) {
            centre = locationService.searchCentreOf(viewerId).orElse(null);
        }
        if (centre == null && centreRequired) {
            String message =
                    viewerId == null
                            ? "lat and lng are required for signed-out searches"
                            : "lat and lng are required until you set a trading area";
            throw ApiException.validation(
                    message,
                    List.of(
                            new ProblemFieldError("lat", "is required"),
                            new ProblemFieldError("lng", "is required")));
        }
        return new GeoScope(centre, radius(viewerId, radiusKm));
    }

    private double radius(@Nullable UUID viewerId, @Nullable Double requested) {
        if (requested != null) {
            double radius = round1(requested);
            LimitDecision decision = check(viewerId, (long) Math.ceil(radius));
            if (!decision.allowed()) {
                throw new LimitReachedException(decision);
            }
            return radius;
        }
        double radius = round1(properties.defaultRadiusKm());
        LimitDecision decision = check(viewerId, (long) Math.ceil(radius));
        if (!decision.allowed() && decision.limit() != null) {
            return decision.limit();
        }
        return radius;
    }

    private LimitDecision check(@Nullable UUID viewerId, long requested) {
        return viewerId == null
                ? limits.checkValueForAnonymous(RADIUS_LIMIT, requested)
                : limits.checkValue(viewerId, RADIUS_LIMIT, requested);
    }

    private static double round1(double value) {
        return BigDecimal.valueOf(value).setScale(1, RoundingMode.HALF_UP).doubleValue();
    }
}
