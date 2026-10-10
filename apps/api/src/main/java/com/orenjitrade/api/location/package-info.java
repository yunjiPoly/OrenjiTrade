/**
 * Location module (ADR 0017: platform regions instead of geolocation).
 *
 * <p>Owns the platform regions, the countries mapped to them and their first-level subdivisions
 * (reference data, {@code GET /api/v1/regions}, admin edits under {@code /api/v1/admin/regions}),
 * and each collector's self-declared location: country, state/province and an optional city with a
 * "show my city on my profile" switch. No coordinate, GPS fix, geocoding or distance exists
 * anywhere. Other modules get a {@link com.orenjitrade.api.location.domain.PublicPlace} (state or
 * province + country, never the city); only the collector's own profile and the owner's own
 * settings and export ever carry the city.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Location")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.location;
