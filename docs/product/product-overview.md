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

- **18+ only.** OrenjiTrade is for adults: every account confirms "I am 18 years of age or
  older" at sign-up (an explicit, unticked checkbox, English and French) and the confirmation is
  recorded server-side with its date like any other consent. Accounts created before the rule
  confirm in the onboarding flow on their next sign-in. Until then an account can browse but
  cannot become discoverable on the map, message, post in the community or make offers
  (`403 AGE_CONFIRMATION_REQUIRED`). Self-declaration only, no identity verification; accounts
  found to belong to minors are closed (Terms of Service, Privacy Policy).
- **Trading safety.** OrenjiTrade is a discovery and messaging venue, not a party to trades:
  collectors meet and trade on their own. A "Trading safely" page (`/legal/trading-safely`, English
  and French) explains how: busy public places in daylight (police safe exchange zones), bring
  someone along for valuable cards, never share a home address, check the cards before paying,
  warning signs, how to report and block. A short, dismissible safety notice with that link and the
  Report / Block actions appears in every conversation and on the offer and trade pages; it never
  blocks messaging. Report and Block are available from the profile, the conversation menu and
  Settings.
- **Legal pages in French and English (Bill 96).** Every legal page (Terms, Privacy, Community
  Guidelines, Marketplace, Payment Protection, Refunds, Cookies, Acceptable Use, Trading safely)
  exists in French and in English with an EN/FR switch, French by default for a French browser; the
  consent record stores the version and the language shown. The texts are drafts pending lawyer
  review (banner on both languages); the Privacy Policy names the person in charge of the
  protection of personal information (Law 25), how to exercise access, correction and deletion
  rights, the incident notification rule and the providers that may store data outside Quebec.
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
