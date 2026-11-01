/**
 * Deals module (stage R4 of the phone redesign, "Messages and Mark as sold"; ADR 0018, part 2).
 *
 * <p>Deals happen in the chat and cards ship by mail: the buyer pays the seller outside the app
 * (Interac e-Transfer) and the seller marks the chat's card or deck core sold, with the copies sold
 * and an optional tracking number. {@code SaleService} records the {@code sale} row ({@code POST
 * /conversations/{id}/sales}, the seller only: the chat's subject must be theirs) and undoes it
 * ({@code POST /sales/{id}/undo}, within 10 minutes and before anyone rated it). It calls the other
 * modules through their services: the inventory module's {@code InventorySales} (the copies leave
 * the inventory, the lock order of docs/database/schema.md), the messaging module's {@code
 * ConversationService} (the chat's subject, the SYSTEM sale message with its key {@code
 * sale:<id>:SOLD}), the ratings module's {@code InteractionService} (a {@code SALE} interaction, so
 * both can rate at once) and the notifications module (the buyer's in-app notice). It implements
 * the messaging module's {@code ChatSaleStatus} (the pinned bar's "Sold") and the ratings module's
 * {@code SaleDeals} (the rating form's "{card} · sold to you {date}", stage R14).
 *
 * <p>OrenjiTrade never handles the money and claims no protection, escrow or guarantee. Tracking
 * numbers are seen by the two collectors only, never logged and never in analytics.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters). Entities never leave
 * the module; other modules use its service interface, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Deals")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.deals;
