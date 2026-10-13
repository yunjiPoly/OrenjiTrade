/**
 * Ratings module.
 *
 * <p>Post-trade ratings and references with eligibility checks and duplicate prevention (Phase 7):
 * {@code InteractionService} (the interactions that make two collectors eligible: completed trades
 * and accepted offers recorded by Phase 8, conversations qualified by 3 messages from each side
 * recorded here from the messaging module's {@code MessageSent}), {@code RatingService}
 * (eligibility, ratings editable for 14 days, {@code rating_summary} maintenance, RATING_RECEIVED
 * notifications, moderator hide/unhide), {@code ReferenceService}; implements the profiles module's
 * {@code RatingSummaryProvider} (profiles, search results and their ranking). Publishes {@code
 * RatingSubmitted}.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Ratings")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.ratings;
