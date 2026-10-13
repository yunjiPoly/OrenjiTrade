/**
 * Analytics module.
 *
 * <p>Schema-versioned analytics events (no PII; geography is region and subdivision codes only, ADR
 * 0017) published through the EventTransport to Pub/Sub and BigQuery; consumes domain events only.
 * Phase 4 (minimal slice): {@code AnalyticsEvent} (event id, type, version, occurredAt, actor hash,
 * region / subdivision code, a payload that refuses coordinates and contact keys), {@code
 * AnalyticsPublisher} (asynchronous, never fails a request), {@code LogAnalyticsTransport}
 * (default, {@code EVENTS_TRANSPORT=local}) and {@code PubSubAnalyticsTransport} (only with {@code
 * EVENTS_TRANSPORT=pubsub}); {@code search_performed}, {@code search_no_results}, {@code
 * collector_viewed}, {@code binder_viewed} and {@code card_viewed} are derived from in-process
 * notifications of the search, profiles, binders and cards modules. No other module depends on this
 * one.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Analytics")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.analytics;
