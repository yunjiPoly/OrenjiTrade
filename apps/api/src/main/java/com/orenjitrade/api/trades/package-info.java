/**
 * Trades module.
 *
 * <p>Trades created from accepted offers: statuses, buyer and seller views, shipment and receipt
 * confirmation. Phase 8: {@code TradeService} (opened through the offers module's {@code
 * AcceptedOfferHandler}, list and trade page with the next action, in-person meetups, completion by
 * both parties with the inventory transfer and the TRADE interaction, cancellation before payment),
 * {@code TradeRules} (pure), {@code TradeActivity} (TRADE_UPDATE notifications and SYSTEM messages
 * after commit); open trades block account deletion. Publishes {@code TradeUpdated}. Phase 9: the
 * payments module moves protected trades through PAID, SHIPPED, RECEIVED / DISPUTED to COMPLETED or
 * CANCELLED ({@code TradeService#advance}, {@code completeProtected}, {@code cancelProtected}) and
 * fills payment, shipment and dispute on the trade page through the {@code TradeProtection}
 * extension point.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Trades")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.trades;
