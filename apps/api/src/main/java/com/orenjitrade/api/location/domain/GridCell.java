package com.orenjitrade.api.location.domain;

/**
 * A cell of the ~1 km public grid (ADR 0004): rows are {@value ApproximateLocationService#CELL_DEG}
 * degrees of latitude, columns {@code CELL_DEG / cos(row centre latitude)} degrees of longitude so
 * cells stay roughly square. The id {@code r<row>c<col>} is the only location value analytics may
 * carry.
 *
 * @param row {@code floor(lat / CELL_DEG)}
 * @param col {@code floor(lng / cellWidth(row))}
 */
public record GridCell(long row, long col) {

    public String id() {
        return "r" + row + "c" + col;
    }

    public double south() {
        return row * ApproximateLocationService.CELL_DEG;
    }

    public double north() {
        return south() + ApproximateLocationService.CELL_DEG;
    }

    public double west() {
        return col * ApproximateLocationService.cellWidthDeg(row);
    }

    public double east() {
        return west() + ApproximateLocationService.cellWidthDeg(row);
    }

    public boolean contains(double lat, double lng) {
        return lat >= south() && lat < north() && lng >= west() && lng < east();
    }
}
