# OrenjiTrade — product overview

## Vision

OrenjiTrade is a geographic discovery network for trading cards. Instead of hunting through
marketplace listings, Facebook groups, Discord servers and forums, a collector opens one map and
sees which nearby collectors own, trade, sell, want or accept offers for a card. The network and
its data graph (who owns / wants / trades / sells what, near where) is the long-term asset.

Games at launch: Yu-Gi-Oh!, Pokémon, Magic: The Gathering, Riftbound. The model is
game-agnostic so more games are data, not code.

## Two primary surfaces

1. **Map / Discovery** (`/map`, mobile Map tab): Google Map of approximate collector positions,
   prominent search, collector preview (name, avatar, approximate distance, rating, tags, last
   active, binder freshness, games, view profile / view binder / message), collapsible private
   messaging panel on desktop, filters bar. Collectors only — no stores or events in the MVP.
2. **Inventory management** (`/inventory`, mobile Inventory tab): the collector's own cards and
   binders with private / public / temporarily-public visibility, availability (collection only,
   trade, sale, trade or sale, accepting offers, not available), condition, language, printing,
   edition, asking price, notes, bulk actions, binder management, freshness confirmation.

Supporting surfaces: search, collector profile + public binder, wishlist + alerts, private chat,
community channels, offers and trades, ratings and references, collector reporting, settings
(privacy, notifications, account deletion), legal pages, admin console.

## Core user journeys (E2E scenarios)

Registration → profile → trading area → interests · Inventory add/organise/publish ·
Map discovery → preview → profile → binder → message · Card search → nearby holders ·
Wishlist → match → notification · Offer lifecycle · Rating after eligible interaction ·
Report collector (reason + confirm) → admin review → audit · Freemium limit → upgrade prompt ·
Account deletion → public traces removed.

## Trust and safety principles

- Approximate locations only; users control discoverability, distance display, online/last-active
  visibility, messaging permissions. Defaults favour safety.
- Freshness is first-class: stale inventory ranks lower, is warned about, then hidden until the
  owner reconfirms. Nothing is deleted automatically.
- Ratings require an eligible interaction. Reporting is simple (collector only) and audited.
- Payment protection (feature-flagged, Stripe Connect) uses provider-held funds with delayed
  payout. It is described as payment protection, never as escrow.

## Business model

Free tier is genuinely useful (profile, inventory, one public binder, map, messaging, limited
alerts). Premium raises limits and adds power tools (unlimited alerts, advanced filters, larger
radius, saved searches, analytics, no ads). All limits are configurable by admins. Additional
revenue: TCG-focused sponsored placements (clearly labelled, generalized geography only),
voluntary donations, and non-cash OriEnji credits with an immutable ledger.

## Explicit non-goals for the MVP

Stores, events/meetups directory, binder-to-binder matching, unboxing-video evidence, general
social networking, a homemade payment processor, regulated escrow.
