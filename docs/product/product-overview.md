# OrenjiTrade — product overview

## Vision

OrenjiTrade is a regional discovery network for trading cards. Instead of hunting through
marketplace listings, Facebook groups, Discord servers and forums, a collector opens one map and
sees which collectors of their region, state by state, own, trade, sell or want a card. Deals
happen in the chat and cards ship by mail: the buyer pays the seller outside the app (Interac
e-Transfer), the seller ships with tracking, and OrenjiTrade never handles the money (ADR 0018,
2026-10-14). The network and its data graph (who owns / wants / trades / sells what, in which state or
province) is the long-term asset. Since ADR 0017 (2026-10-08) collectors declare a country and a
state or province; OrenjiTrade never handles positions or distances.

Games at launch: Yu-Gi-Oh!, Pokémon, Magic: The Gathering, One Piece (stage G, V130), Riftbound.
The model is game-agnostic so more games are data, not code. The card data comes from YGOPRODeck
(Yu-Gi-Oh!), Scryfall (Magic) and TCGdex (Pokémon), English cards only (ADR 0021, owner order of
2026-10-20); One Piece and Riftbound wait for a source.

**Clients today (2026-10-26).** A web app and a phone app (Expo) on the same API. Since the owner's
order of 2026-10-12 the phone is the client of new work and the web app is paused (it keeps what it
had and stays the reference for what the phone offers). Nothing is deployed. The owner approved a
redesign of the phone app on 2026-10-14 (stages R1 to R8,
[specs/2026-10-14-phone-redesign.md](specs/2026-10-14-phone-redesign.md)) and finished it with the
prompt of 2026-10-19/20 (stages G and R9 to R15,
[specs/2026-10-20-finish-the-phone-ui.md](specs/2026-10-20-finish-the-phone-ui.md); mockup v50,
screens 1 to 75). **The whole redesign is built** (R1 to R6 and G on `main`; R7, R9, R10 and R11 on
`main` by #86; R12 to R15 and the wrap-up R8 in the one giant pull request on
`feature/r7-home`). On the phone a collector now:

- opens the app on **Home** (five tabs: Home, Search, Inventory, Messages, Profile), the region's
  activity for one game: new cards, wishes with "I have it", deck cores, by time;
- browses **one game at a time** (the game pill: Yu-Gi-Oh!, Pokémon, Magic, One Piece, Riftbound;
  card data for Yu-Gi-Oh!, Magic and Pokémon, English cards only) in one **platform region** (the
  region pill);
- **searches** a map of public binders and deck cores by state or province, a card with the
  collectors who have it ("Who has this card", by province), binders and deck cores, and their own
  wishes with "Available";
- keeps an **inventory** (a price typed in "$" or "% TCG", photos, undo of a delete, Public or
  Private on every card), binders of one game and **deck cores** for sale, and imports a deck file
  or a Collectr CSV;
- **deals in the chat**: the card or deck core pinned, a buying or selling tip, quick replies, the
  "+" sheet (e-Transfer email, address, tracking), Mark as sold with Undo, then a rating; and
  talks in **Community**, one room per game of the region;
- gets **notifications** behind the bell, edits a **profile** others read with Message, Cards,
  Binders, Looking for, About and ratings, and runs **Settings** (location and the map, privacy,
  notifications by channel, appearance, blocked collectors, reports, account deletion, legal);
- **without an account** (a guest, stage R15): opens on Home and browses Home and Search with the
  places of the collectors, never who they are; Inventory, Messages, Profile and Search › Wishlist
  ask to sign in, and an action that needs an account (Message, I have it, a profile, a wish,
  Report) opens one sheet and finishes after the sign-in.

"Make an offer", trades, protected payments and disputes are off the phone (ADR 0018; the API
keeps them for the paused web). Older passages below may still describe the web or the phone of
before the redesign. What the owner's change of 2026-10-08 delivered and what it did not:
[2026-10-08-change-delivery-report.md](2026-10-08-change-delivery-report.md).

## Two primary surfaces

1. **Map / Discovery** (`/map`; on the phone Search's default view since stage R5): a map of the platform region (Americas North,
   Americas South, Europe; a region switcher at the top left) with states and provinces shaded by
   their public binders; choosing a state lists its binders (owner, state, freshness, games);
   prominent search and "who has this in my region"; collapsible private messaging panel on
   desktop. The phone draws the same map (stage M9, 2026-10-12; Search's map since R5) with the
   region and game pills on top, a state card with the state's binders and deck cores, and the same
   places as a list. Collectors only — no stores or events in the MVP.
2. **Inventory management** (`/inventory`, mobile Inventory tab): the collector's own cards and
   binders with private / public / temporarily-public visibility, availability (collection only,
   trade, sale, trade or sale, accepting offers, not available), condition, language, printing,
   edition, asking price, notes, bulk actions, binder management, freshness confirmation. On the
   phone (stage S5, 2026-10-13) a collector can also fill the inventory from a Yu-Gi-Oh! deck file
   (.ydk) or a Collectr CSV export: the file becomes a preview to check (printings, conditions,
   copies, lines left out) and nothing is added before the collector confirms; new cards start
   private. The web has no import screen (paused).

Supporting surfaces: Home's feed (phone, stage R7), search, collector profile + public binder and
deck core, wishlist + alerts, private chat (where deals happen, Mark as sold on the phone), the
community (one room per game and region on the phone since R11), notifications, offers and trades
(web only since stage R1, ADR 0018), ratings and references, collector reporting, settings
(privacy, notifications, account deletion), legal pages, admin console (web only).

**Not built** (owner decision of 2026-10-13, stages S3 and S4 of the 2026-10-08 change): the
printing picker with holder counts on the card page ("any printing" by default), holders by rarity,
"Find this card", "Who wants it", "Wanted by N" on one's own inventory items, a server-side search
history (the phone keeps recent searches on the device), and photos in community posts. The
redesign of 2026-10-14 drops "Who wants it", "Wanted by N" and the holder counts, and keeps recent
searches on the phone.

## Core user journeys (E2E scenarios)

Registration → profile → location (region, country, state or province, optional city) →
interests · Inventory add/organise/publish · Map → state → binder → profile → message · Card
search → holders in my region ·
Wishlist (which copy, public note, Near Mint only, % TCG term) → a collector of the region lists
it → wishlist alert → card page · A deal in the chat: ask, agree on the price and the shipping,
pay outside the app, ship with tracking, Mark as sold (Undo for 10 minutes) · Rating after an
eligible interaction (a real conversation, or a sale) · A guest browses Home and Search → taps
Message → one sheet → signs in or creates an account → the chat opens with the card pinned ·
Report collector (reason + confirm) → admin review → audit · Usage limit reached → a plain
explanation (no plan, nothing to buy) ·
Account deletion → public traces removed.

## Trust and safety principles

- **18+ only.** OrenjiTrade is for adults: every account confirms "I am 18 years of age or
  older" at sign-up (an explicit, unticked checkbox; English and French on the web, English on the
  phone since the owner's order of 2026-10-20) and the confirmation is
  recorded server-side with its date like any other consent. Accounts created before the rule
  confirm in the onboarding flow on their next sign-in. Until then an account can browse but
  cannot become discoverable on the map, message, post in the community or make offers
  (`403 AGE_CONFIRMATION_REQUIRED`). Self-declaration only, no identity verification; accounts
  found to belong to minors are closed (Terms of Service, Privacy Policy).
- **Trading safety.** OrenjiTrade is a discovery and messaging venue, not a party to deals:
  collectors agree in the chat and cards ship by mail; there are no meetups (ADR 0018). A "Trading
  safely" page (`/legal/trading-safely`, English and French, a draft) explains it: payment happens
  outside the app (for example Interac e-Transfer) and OrenjiTrade never handles the money; check
  ratings and references and ask for photos of the real card before paying; sellers ship once paid,
  with tracking; share an address only in the chat with the person you deal with; the warning signs
  (pressure, another payment method, gift cards or crypto, a price far below the market, refusing
  tracking); how to report and block. On the phone a small tip with a shield opens every chat, worded
  for its side (buying, selling, or a chat without a card, read from the chat's pinned card since
  stage R4); it never blocks messaging and opens that page. Report and Block are
  available from the profile, the conversation menu and Settings. (The paused web keeps its meetup
  notice on conversations, offers and trades.)
- **Legal pages in French and English (Bill 96).** Every legal page (Terms, Privacy, Community
  Guidelines, Marketplace, Payment Protection, Refunds, Cookies, Acceptable Use, Trading safely)
  exists in French and in English with an EN/FR switch, French by default for a French browser; the
  consent record stores the version and the language shown. The texts are drafts pending lawyer
  review (banner on both languages); the Privacy Policy names the person in charge of the
  protection of personal information (Law 25), how to exercise access, correction and deletion
  rights, the incident notification rule and the providers that may store data outside Quebec.
- No positions or distances at all: others see a collector's state or province; the city is
  optional and shows only on the collector's own profile. A visitor without an account sees the
  places of the collectors and never who they are (no name, handle, avatar or rating; stage R15). Users control discoverability (off by
  default, needs a location), the city, online/last-active visibility and messaging permissions.
  Defaults favour safety.
- Freshness is first-class: stale inventory ranks lower, is warned about, then hidden until the
  owner reconfirms. Nothing is deleted automatically.
- Ratings require an eligible interaction (Overall, Communication, Card condition and Shipping on
  the phone; no meetup score). Reporting is simple (collector only) and audited.
- Payment protection (feature-flagged, Stripe Connect) uses provider-held funds with delayed
  payout. It is described as payment protection, never as escrow. Web only (paused): the phone has
  no payment protection and never claims any (ADR 0018).

## Business model

**Free for all (owner decision, 2026-10-14, ADR 0019).** OrenjiTrade is free: no Premium plans,
no sponsored placements, no credits and no donations. Every collector has the same usage limits
(today: 5 binders, 30 public binder views a day, 20 wishes, 5 wishlist alerts a day, 20 offers a
day, an unlimited inventory), which admins change in `/admin/usage-limits`; a collector who
reaches one is told which limit, how much is used and when it resets, and nothing offers a plan.
The paid features built in Phase 10 (Premium subscriptions with a billing provider, sponsored
placements, non-cash credits with a ledger and referrals, voluntary donations) were removed from
the API, the phone and the web on 2026-10-14; their code waits on the branch
`archive/paid-features` until the owner brings one back (that code plus a new migration recreating
its tables).

**Launch without payments (owner decision, 2026-10-05).** OrenjiTrade launches as *discovery +
messaging only*: collectors find each other's binders in their region (search and the region
map's state lists) and chat, then trade on their own. The one money feature left, payment
protection, is built and feature-flagged but **switched off at launch**: `protectedPayments`
(payment protection, payouts, disputes); `mlScanning` stays off by the Phase 11 hold and
`publicChat` stays on (the `premiumPlans`, `credits`, `donations` and `advertising` flags left
with their features on 2026-10-14). With the flag off no screen offers to pay, the payment routes
answer `404 FEATURE_DISABLED`, and on the web offers are plain proposals and an accepted offer
opens an in-person trade. The phone has no offers or payments at all since stage R1: deals happen
in the chat and ship by mail (ADR 0018). The flags live in the database (migrations V010 + V105)
and a super admin turns a feature on in `/admin > Feature flags` once its provider, keys and
policies are ready (`docs/deployment/runbooks.md`, "Launch configuration").

## Explicit non-goals for the MVP

Stores, events/meetups directory, binder-to-binder matching, unboxing-video evidence, general
social networking, a homemade payment processor, regulated escrow.
