/**
 * Offers module.
 *
 * <p>Cash, trade and mixed offers with lifecycle OPEN -> COUNTERED -> ACCEPTED ->
 * DECLINED/CANCELLED/EXPIRED and full history (Phase 8): {@code OfferService} (offers on public
 * cards with the listing, kind, block and {@code offers.per_day} rules, the counter chain with
 * {@code current_turn} and optimistic versions, accept / decline / cancel, the hourly expiry, the
 * offer links of messages), {@code OfferStateMachine} (pure transitions), {@code OfferActivity}
 * (notifications and SYSTEM messages after commit) and the seller setting {@code accepts_mixed}.
 * Acceptance opens the trade through the {@code AcceptedOfferHandler} extension point (implemented
 * by the trades module) and records the OFFER_ACCEPTED interaction of the ratings module.
 * Implements the messaging module's {@code OfferLinkResolver}. Publishes {@code OfferCreated} and
 * {@code OfferUpdated}.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Offers")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.offers;
