# The owner's prompt of 2026-10-28: the web redesign, stages WA to WH2 (saved word for word)

Saved by the lead on 2026-10-28, unchanged below the line. It lifts the web pause for these stages. Its appendix, the spec and the owner decisions, is saved unchanged as [`2026-10-20-web-redesign.md`](2026-10-20-web-redesign.md). The web mockup it names is the design artifact PV4tJzrVSeNnKyajPFMXfP (a local copy of its boards: `/Users/yunji/Dev/.orenji-web-mockup/project/`, outside the repository).

---

You are working in the OrenjiTrade monorepo (CLAUDE.md, IMPLEMENTATION_STATUS.md and docs/development/claude-handoff.md first). The web app (apps/web-angular) has been paused since 2026-10-12 (CLAUDE.md rule 9). On 2026-10-20 the owner asked: "could we continue on designing the web version of this app?"

I'm lifting the web pause for the stages in this prompt. Update CLAUDE.md rule 9 in stage WA to say so: the web resumes for stages WA to WH2 of docs/product/specs/2026-10-20-web-redesign.md. Stages S3 and S4 stay skipped.

The design is the web mockup https://claude.ai/artifact/PV4tJzrVSeNnKyajPFMXfP. Its board titles:
- W1 Home, signed in; W2 Home on day one; W3 Search box, region and game pickers;
- W4 Search: binders beside the map; W5 Search: a deck core opened beside the list; W6 Search: your wishlist and who has each card; W7 Who has this card; W8 A deck core; W9 A public binder;
- W10 Inventory: table and grid; W11 select many, change them at once; W12 edit a card; W13 add cards; W14 quick add rows; W15 binders; W16 Import: check the cards; W17 Import done;
- W18 Messages: selling, with the deal beside the chat; W19 Mark as sold; W20 buying a deck core; W21 Message without leaving the card; W22 Community room;
- W23 A collector profile; W23b Your own profile; W24 Notifications; W25 Settings;
- W26 Home without an account; W27 Sign in and create an account;
- W28 A smaller laptop (1024 px); W29 A phone-sized window; W30 Light theme;
- the admin console: A1 Overview; A2 Reports, a report open; A3 Resolving a report; A4 Flags and rules; A5 Community rooms; A6 Ratings and references; A7 Users; A8 A collector's account; A9 Listings; A10 Binders; A11 Cards, a card open; A12 Card data and images; A13 Games; A14 Usage limits; A15 Import limits; A16 Wishlist terms; A17 Auto-delist; A18 Feature flags; A19 Regions; A20 Notifications and announcements; A21 System health; A22 Analytics; A23 Audit log; A24 A moderator's console.

The phone mockup https://claude.ai/artifact/7D7C3zyoabMbz47s3fCL1Q (version 50) stays the source for words, icons and behaviour that the web shares.

Save the spec and the owner decisions at the end of this prompt as docs/product/specs/2026-10-20-web-redesign.md, unchanged, in stage WA's PR. Where this prompt and the spec disagree, this prompt wins. Where the spec and the mockup disagree on behaviour, the spec wins; on looks and wording, the mockup wins.

## 0. How to work

- Nine stages, one branch and one PR each, in this order:
  - WA Tokens and the shell;
  - WB Inventory and Import;
  - WC Messages: the deal beside the chat;
  - WD Search, the card page, sets, binders and deck cores: after phone stage G;
  - WE Home, profiles, notifications and settings: after phone R7 (GET /feed) and R9 (excludeTypes);
  - WF Messages › Community: after phone R11;
  - WG Sign-in, welcome and guests: sign-in and welcome any time after WA; the guest parts only after phone R15;
  - WH1 The admin console: the shell, the overview and moderation; after WA (its Community rooms after phone R11);
  - WH2 The admin console: collectors, catalog, rules and system; after WH1.
- A web stage never runs at the same time as a phone stage that edits packages/design-tokens or the same API module. Start each stage from the latest origin/main.
- Run each stage the way the phone stages run (the handoff's rules):
  - its own worktree, database, Redis db and ports, never the owner's ports (8080, 4200) or database;
  - a builder, then at least two independent reviewers: a functional verifier, and product and UX as a collector at a desk (as a staff member for WH1 and WH2); add privacy for WC, WD, WE, WF, WG, WH1 and WH2, and accessibility (keyboard only, a screen reader, 200% zoom, light theme) for WA, WB, WC and WH1;
  - at most two fix rounds;
  - the handoff's whole check list before every PR, plus `npm run lint`, `npm test` and `npm run build:prod` in apps/web-angular (the initial bundle budget is 900 kB; the new shell replaces the old one, it never sits beside it);
  - Playwright E2E for every user-facing flow the stage changes, on the E2E database (#39), never the dev database;
  - a merge commit once CI is green.
- Extend what exists. Today's web screens work: keep every function, state and error they have unless the spec removes it, and restyle them. Every screen keeps skeletons, an empty state and an error with "Try again", and full keyboard use.
- The phone must keep working after every stage: shared tokens, the API and packages/api-client are shared. Run the phone's tests too when a stage touches them.
- Server DTOs come only from packages/api-client (regenerate it; never hand-written interfaces). No new dependency: Angular CDK and Material cover drag, overlays, focus and virtual scroll.
- New Flyway migrations only. Fictional seed data only.
- On this Mac, write "the Android run could not be verified" in a report only when the stage touched the phone.

Owner checks (built unless I deleted the line before sending):
- "I have this card" on the card page opens the Add drawer for that card (decision 17).
- Quick add rows with Shift+N (decision 18).
- Inline price and copies edits in the Inventory table (decision 18).
- Drag cards into same-game binders, each drag with a menu equivalent (decision 18).
- "Add from this set" on set pages (decision 18).
- The non-modal chat drawer and the deal panel's "More from {seller}" (decision 18).
- After an import, the imported cards open already selected (decision 18).

Never build, on any stage:
- offers, trades, checkout, protected payments, disputes, meetups, stores or pickup, on screen or in copy (ADR 0018; the server modules stay; the admin console keeps its Transactions, Disputes and Payments pages, shown only while protectedPayments is on);
- Premium, ads, credits or donations (ADR 0019);
- any coordinate, distance, radius, "near you" or "km away", geolocation, IP geolocation or geocoding (ADR 0017); the city only on its owner's profile while show_city is on;
- a map shaded by a card's holders, or people and pins on a map;
- counts in search results (owner 2026-10-14);
- market prices or card text; TCGplayer stays a plain link;
- camera or scan on the web (ML hold);
- card art wider than 160 CSS px, or any image not from /api/v1/public/card-images/{id} (ADR 0015);
- a saved address or e-Transfer email on the web (decision 9);
- the bulk API additions in spec section 18 ("New and additive"): their controls stay hidden until I ask (decision 19).

## WA. Tokens and the shell (W3, W28, W29, W30)

Spec sections 1 to 4, 16, 17, 20 and 21; decisions 2, 5, 6, 12, 21, 22, 23 and 24.
- Tokens (spec 2.1): the additive colours and sizes, and the light onPrimary change from white to ink #1C1917 (decision 21). Check the phone's light theme with it. Move the game monograms into tokens and delete the hard-coded ones in _app-extras.scss.
- Material restyled through mat.theme() system variables (spec 2.7): ripples and elevation off.
- The new shell (spec 4): top bar 64 with the wordmark, region pill, game pill, global search with "/" and Ctrl/Cmd+K, bell and avatar; the 72 rail (Home, Search, Inventory, Messages with its unread badge, Profile, the "?" keyboard dialog; staff also get Admin); the account menu; toasts, dialogs and drawers (spec 4.8); the keyboard dialog with its off switch in Settings › Appearance (decision 24). It replaces today's mat-toolbar, top bar, card-search-box, the map page's mat-sidenav and app-bottom-nav.
- Pill scope: Home and Search show both pills; card, set, binder and deck core pages the region pill only; Inventory, Messages, Profile, Settings and Notifications none. Until stage WD and phone stage G, the game pill shows Yu-Gi-Oh! and its popover lists the other games as "Cards coming soon".
- Routes and redirects (spec 4.11), all lazy. Offers, trades, checkout and disputes leave the web UI with the redirects and the toast the spec gives (decision 2). Old offer messages and notifications read as history.
- Narrow screens below 960 use the phone's design in the browser (spec 16, W29); md 960 to 1279 as W28 (spec 3).
- The light theme as W30; the theme follows the system by default (decision 12).
- Stale copy (spec 20): the meetup safety notice, the "accepts offers" meta description, the "Where do you like to meet?" placeholder, the Offers and Trades links. No indexing except the landing and legal pages (decision 6). The legal index hides Payment Protection and Refund & Dispute while protectedPayments is off (decision 23).
- Tests: shell components, routes and redirects, the keyboard shortcuts and their off switch, focus order and skip links, the light-theme contrast pairs, E2E of moving through the five areas at 1440, 1024 and 390 wide.

## WB. Inventory and Import (W10 to W17)

Spec section 9; decisions 8, 18, 19 and 20.
- The phone's card model on the web (decision 8): copies, the "$ | % TCG" price saved as text, Public or Private, binder, public note, photos. Old web items with a condition, language or edition show them read-only as "From the old web form: …" with "Add to public note"; never migrate them.
- The binder pane, the toolbar, the table (72 px rows with real art) and the grid, selection and the bulk dock with the existing bulk actions (SET_VISIBILITY, MOVE_TO_BINDER, CONFIRM, DELETE) and Undo through /items/{id}/restore.
- The Edit card and Add cards drawers (440) beside the list, with Previous and Next and the add loop; the toasts "Saved" with View, and "Card deleted" with Undo.
- The owner-check items of section 0 that belong here: quick add rows, inline edits, drag to binders (CDK drag-drop only in this chunk, each drag with a "Move to binder" menu path).
- Import (/inventory/import): .ydk and Collectr CSV through the existing /inventory/imports endpoints; the limits come from /imports/limits, never hard-coded (decision 22). Check whether the commit returns the new item ids; if not, the post-import selection waits and the report says so.
- Binders tab, Edit binder and New binder (spec 9.12). Until phone stage G lands, binders have no game section; build the grouping by game in WD.
- Tests: unit tests for the table, selection, the bulk dock, the drawers and the price switch; E2E of add, edit, delete with Undo, bulk move and an import of a fictional .ydk and CSV.

## WC. Messages: the deal beside the chat (W18 to W21)

Spec sections 10.1 to 10.6 and 10.8; decision 9.
- Inbox 340, chat, deal panel 320 at lg; the deal panel as a drawer at md; one pane per route below 960.
- The pinned card or deck core, Mark as sold with quantity and tracking number through POST /conversations/{id}/sales and its undo, Rate and Report as the phone does.
- The "+" menu: "Send my address" and "Send my e-Transfer email" are typed each time and never saved (decision 9); Settings › Shipping details says so (spec 13).
- The chat drawer (one at a time) opened from cards, binders and Home, as a lazy chunk shared with Messages.
- "More from {seller}" (owner check): if it needs a new endpoint, the endpoint returns places only and joins GeoPrivacyContractTest.
- Tracking numbers never go into logs or analytics.
- Tests: E2E of a buyer and a seller chat, Mark as sold and its undo, the drawer from a card page; a test that nothing is written to localStorage, sessionStorage or IndexedDB for the address or e-Transfer email.

## WD. Search, Who has this card, sets, binders and deck cores (W3, W4 to W9). After phone stage G.

Spec sections 6, 7 and 8; decisions 7, 10, 14, 15 and 17.
- One game at a time (decision 7): the game pill scopes Home and Search; every Search call sends region= and game=, as the phone does after G.
- Search: the list beside the map; clicking a state lands on its binders (decision 15); drill-in of a binder or deck core beside the list; the third pane only at xl ≥1920. The Wishlist tab (W6) as spec 6.6. Leaflet only in the Search chunk.
- A binder view is spent only on an explicit open, never on hover or prefetch (decision 14).
- Who has this card (W7): no market prices and no card text, only "Check TCGplayer price" (decision 10); "Jump to" province chips, no holder map; "I have this card" (owner check).
- Set pages and "Add from this set" (owner check). Binders and deck cores (W8, W9). Inventory › Binders groups by game now.
- Tests: GeoPrivacyContractTest still passes and covers any new endpoint; E2E of search by name, the map, a state's binders, opening a binder, the card page, the wishlist tab; a test that hovering or prefetching never spends a binder view.

## WE. Home, profiles, notifications and settings (W1, W2, W23 to W25). After phone R7 and R9.

Spec sections 5, 11, 12 and 13; decisions 13 and 16.
- Home (W1, W2): the feed from GET /feed with All, New cards, Wanted and Deck cores, "New posts" without a count, the end of the feed, and the rail with Get started or the map card only (decision 16: no "Your desk" and no wishlist availability).
- Profiles (W23, and your own on W23b): the city only in the owner's header while show_city is on; no availability on wishes.
- Notifications (W24): the bell popover and /notifications with excludeTypes=MESSAGE; legacy offer, trade, payment and dispute kinds read as history; no web push (decision 13).
- Settings (W25): the sections of spec 13, Offers and Payouts removed, Shipping details as text only, Appearance with the theme tiles and the shortcuts switch, Legal with the hidden payment policies.
- Tests: GeoPrivacyContractTest for the feed and profiles on the web routes; E2E of Home's filters, the bell, marking all as read, editing the location.

## WF. Messages › Community (W22). After phone R11.

Spec section 10.7; decision 11. One room per region × game, as the phone's R11. Posts carry text and a shared card, binder or deck core, no photos: community photos are stage S4, which stays skipped until I ask. Tests: posting, reporting a post, a blocked author hidden, GeoPrivacyContractTest for rooms.

## WG. Sign-in, welcome and guests (W26, W27)

Spec section 14; decision 4.
- Sign in, sign up (the 18+ line separate, never covered by "Accept all"), verify email, reset password, the three welcome steps and the account states: any time after WA.
- Guests: only after phone R15, which makes the API send no identity to signed-out callers. Guests see Home, Search (Cards and Binders), card, set, binder and deck core pages, Legal and Appearance; collectors show as "A collector" with the province; Inventory, Messages and Profile show the guest pages; actions open the sign-in dialog and resume afterwards.
- Tests: E2E as a guest on every open page with no handle, name, avatar or rating in the HTML or the API responses; each action's dialog and its resume after sign-in.

## WH1. The admin console: shell, overview and moderation (A1 to A6, A24). After WA.

Spec section 15; decision 3. A redesign in the new look, not a reskin: every function, filter, dialog, validation message and state of today's pages stays; the boards show where each one lives now.
- The shell (15.1): the top bar with the staff search, the role pill and "Back to OrenjiTrade"; the grouped nav with the open counts; Transactions, Disputes and Payments only while protectedPayments is on (today they always show). Moderators keep their 5 items.
- The overview for admins (A1) and for moderators (A24).
- Reports as one split view with the resolve dialog (A2, A3); Flags and rules as one page (A4), and the Community page's flags tab removed; the Community rooms (A5) after phone R11 (before that, today's channel list with region names); Ratings with References (A6).
- The API changes of 15.8 that these pages need: report numbers, names instead of ids on ratings and flags, the room and text of flagged community content (never a private message's text), and the conversation of a report without shipping addresses or e-Transfer emails.
- Tests: 15.9 for these pages; E2E: resolve a report with a warning, and archive and restore a room.

## WH2. The admin console: collectors, catalog, rules and system (A7 to A23). After WH1.

- Users and the account page, Listings, Binders and the Audit log (A7 to A10, A23), with labels for every audit action the API writes.
- Cards with the card drawer, Card data and images (the sync form with its images mode, runs and their reports, the card image cache with check and clear) and Games (A11 to A13). These use endpoints that have no screen today; agents never run a real provider import, and the E2E database never calls a provider.
- Usage limits, Import limits (new page), Wishlist terms, Auto-delist, Feature flags and Regions (A14 to A19); Notifications, System health with every job named, and Analytics (A20 to A22).
- The rest of 15.8: updatedBy names, readable audit targets, the References list if missing, and the staff search.
- Tests: 15.9 for these pages; E2E: edit an import limit and see the phone's import read it.

## Documents and the report, per stage

- IMPLEMENTATION_STATUS.md: what the stage built, what it left hidden and why, and the exact next stage.
- The PR body: before and after, with screenshots at 1440, 1024 and 390, dark and light.
- The report to me: what to click to see it, anything you couldn't verify, and any spec point you changed and why.

(The appendix follows in the owner's message: see 2026-10-20-web-redesign.md.)
