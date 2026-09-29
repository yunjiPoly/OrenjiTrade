package com.orenjitrade.api.location.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.location.domain.MyLocationView;
import com.orenjitrade.api.location.domain.PublicPoint;
import com.orenjitrade.api.location.domain.TradingAreaSource;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import org.jspecify.annotations.Nullable;

/**
 * Response of {@code GET /api/v1/me/location} and {@code PUT /api/v1/me/location/trading-area}. The
 * only response that contains the caller's own trading-area centre.
 */
@Schema(name = "MyLocationResponse", description = "The caller's own location settings")
public record MyLocationResponse(
        @Schema(nullable = true, description = "The chosen trading area (owner only)")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable TradingAreaResponse tradingArea,
        @Schema(
                        nullable = true,
                        description =
                                "The derived point other collectors see; null while not"
                                        + " discoverable")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable PublicPoint publicPoint,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean discoverable) {

    static MyLocationResponse from(MyLocationView view) {
        MyLocationView.TradingArea area = view.tradingArea();
        return new MyLocationResponse(
                area == null
                        ? null
                        : new TradingAreaResponse(
                                area.lat(),
                                area.lng(),
                                area.radiusKm(),
                                area.source(),
                                area.label()),
                view.publicPoint(),
                view.discoverable());
    }

    /** The owner's trading area. */
    @Schema(name = "TradingAreaResponse", description = "Trading area chosen by the owner")
    public record TradingAreaResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "45.52") double lat,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "-73.58") double lng,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "5") int radiusKm,
            @Schema(requiredMode = RequiredMode.REQUIRED) TradingAreaSource source,
            @Schema(nullable = true, example = "Plateau-Mont-Royal, Montréal")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String label) {}
}
