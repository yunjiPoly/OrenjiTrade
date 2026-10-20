# Owner prompt 2026-10-19: the whole Home page (stage R7)

Saved word for word from the owner's message of 2026-10-19 (prompt 1 of 2). Order of the stages
(owner, same message): R6, then stage G (in
[`2026-10-20-finish-the-phone-ui.md`](2026-10-20-finish-the-phone-ui.md)), then R7 with this
prompt, then R8, then R9 to R15 (R15 after R12). The mockup's version 50 is the owner's design
canvas; agents ask the owner for screenshots of the screens they need.

---

# Prompt 1 of 2: Home (stage R7)

Prompt: the whole Home page for stage R7 (mockup version 50, screens 10, 10b and 10c). It replaces section 5 of the redesign spec and adds to the spec's feed endpoint.

Give it to your own Claude on the Mac when it starts stage R7 (Home), after R6 (Profiles) and stage G (one game at a time, in finish-the-phone-ui.md) are merged.

Home for visitors without an account (screens 70 and 71) comes later, in stage R15 of finish-the-phone-ui.md. R7 builds Home for signed-in collectors only.

```text
You are working in the OrenjiTrade monorepo (CLAUDE.md, IMPLEMENTATION_STATUS.md and docs/development/claude-handoff.md first). Stage R7 of the phone redesign (docs/product/specs/2026-10-14-phone-redesign.md, section 15) builds Home and the feed endpoint. On 2026-10-19 the owner asked: "can you design the full home page?" The design now shows the whole page (https://claude.ai/artifact/7D7C3zyoabMbz47s3fCL1Q, version 49, the "Home" row):

- 10. Home, as it opens: what fits on the screen before you scroll.
- 10b. Home, the whole page as you scroll. Its chips work.
- 10c. Home on day one: a new collector in a quiet region.

The owner then removed the row "Available from your wishlist" from the top of Home: "why you put available from your wishlist at the top of homepage? I think you should remove it unless you have good reasons". The bell's wishlist alerts and the Available label in Search › Wishlist already cover it. Later the same day the owner asked for one game at a time: "On home page, remove "My games". Next to Americas(north), put a dropdown section button to select the game." Stage G builds the browsed game, its pill and its sheet (34) before R7, and binders get a game; Home uses them. The other new screens (31 to 69) belong to other stages, not to R7: until R9 the bell keeps opening today's notifications screen.

This prompt replaces the spec's section 5 (Home) and adds to the "Home feed" part of its section 12. Everything else in the spec stands: privacy, look and feel, tests, the stage process. Where this prompt and the mockup disagree on behaviour, this prompt wins; on looks and wording, the mockup wins.

## 0. How to work

- Stage R7 as section 15 says: a new branch from the latest origin/main in its own worktree, with your own database, Redis db and ports (the handoff's section 4). Never the owner's ports (8080, 4200) or database.
- Reviewers: the functional verifier, privacy (the feed is a new response family) and product and UX as a collector.
- "I have it" and "Message" reuse what R4, R5 and R6 built (section 10 of the spec). Don't build a second way into the chat.

## 1. The page, top to bottom (10 and 10b)

1. Top row: on the left the region pill (the existing switcher; its sheet is 35) and the game pill from stage G (its sheet is 34), on the right the bell. Everything below follows the browsed region and the browsed game.
2. The field "Search cards or collectors". Tapping it opens Search with the keyboard up (12).
3. Get started, only for collectors who haven't finished it (section 3 below).
4. Filter chips: All, New cards, Wanted, Deck cores.
   - Each kind chip has a small dot in its kind's colour: primary orange, accent teal, deckCore purple. All has none. The selected chip is filled light with dark text and is announced as selected.
   - The chip row pins to the top of the screen once you scroll past it (for example with FlatList's stickyHeaderIndices).
   - A chip reloads the feed with kind=. The choice goes back to All when the app restarts.
   - No chips when the region has nothing in the last 30 days (10c).
5. The feed, in sections by time: "Today", "Earlier this week" (1 to 6 days ago), "Earlier this month" (7 to 30 days ago). The spec's "Today in your region" becomes "Today", since the pill already names the region. A section title shows only when the section has posts after the filter. Time labels: "5 min" and "1 h" today, the weekday ("Wed") this week, then the date ("Sep 28"), in the phone's time zone.
6. The end: after the last page, a teal check, "You're all caught up", then "That's everything new for {game} in {region} from the last 30 days." With a chip, "everything new" becomes "every new card", "every wish" or "every deck core". Under it, an "Explore the map" button opens Search on its map (11).

## 2. The posts

- Every post has the same header, which opens the collector's profile (19):
  - the avatar (36);
  - "{handle} {verb}";
  - under it, "{time} · {province}".
- The verbs are "listed {n} cards", "listed a card", "wants a card" and "is selling a deck core". The verb is grey (textMuted) for cards, teal for wishes and deckCore purple for deck cores.
- This replaces the spec's "Wanted · {handle} · {province}", "Deck core · {handle} · {province}" and "listed {card name}".
- Screen readers read the header as "{handle} {verb}, {time}, {province}".

The body depends on the kind:

- **New cards, 2 or more.** One collector's cards that became public within the same hour.
  - A 4-column grid of pictures, with the asking price under each exactly as typed, or nothing when there is no price.
  - A picture opens Who has this card (13) for that card.
  - With 5 or more cards, the 4th tile is dimmed with "+{n}" over it, where n is the total minus 3. It opens the collector's profile on their cards.
  - Groups of 2 or 3 leave the other columns empty.
- **New cards, exactly 1.**
  - A row with the picture (48 x 70), the name, "{code} · {rarity}" (the code in JetBrains Mono) and the price. The row opens Who has this card (13).
  - On its right, a round Message button: 44 wide, with an orange icon on a faint orange fill, labelled "Message {handle} about {card}". It opens or reuses the chat with that collector and pins that card, like Message on a holder row.
- **Wanted.**
  - The picture, the name, and the wish terms written as the Wishlist segment writes them ("Any printing · NM only · 85% TCG", "EXFO-EN065 · NM only").
  - "I have it" (36 tall, orange outline) does what section 10 of the spec says.
  - No "you have it" marker on Home: Inventory › Wanted (stage R10) lists the wishes that fit your cards.
- **Deck core.** The whole body opens the deck core page (16).
  - The first photo fills a 132-tall band with rounded corners.
  - The band carries the "Deck core" tag top left (deckCore tokens), and "{n} photos" with a camera icon bottom right when the core has 2 or more photos.
  - A deck core without photos shows up to 3 of its key cards' pictures in the band instead.
  - Under the band: the name and the price ("$95" or "Trade only"), then the first line of its public note on one line, ending with "…" when cut.
- At large text sizes, names and prices end with "…" rather than wrapping inside the grid.

## 3. Get started (10c)

A card under the search field. It has:
- the title "Get started" and the line "Do these once to sell and find cards in your region.";
- a close button labelled "Hide these steps";
- a 3-part progress bar with "{done} of 3";
- three steps. A done step shows a teal check and its title in grey. A step still to do shows its number and a button.

The steps:
1. **"Choose your province".** It is done when GET /me/location has a subdivision and "Show me on the map" is on.
   - Done, the step shows "{province}, {country}".
   - With no location, it shows "So collectors in your region can find your cards" and a "Choose" button that opens Settings › Location.
   - With a location but hidden from the map, it shows "Turn on Show me on the map" and a "Turn on" button that opens the same screen.
2. **"List your first card".** Its line is "Add a card and set it to Public", and its orange "Add cards" button opens Add cards (3). It is done when at least one of your cards is set to Public.
3. **"Add a card you want".** Its line is "We'll tell you when someone lists it", and its outlined "Add a wish" button opens Search with the keyboard up. It is done when your wishlist has a wish.

When all three steps are done, the card goes away for good, and the close button hides it for good too. Both are remembered per account on this phone (AsyncStorage, keyed by the user id). The steps re-check whenever Home comes back into view.

## 4. Empty, loading and errors

- **Nothing in the region in the last 30 days (10c).**
  - No chips and no section titles.
  - A dashed box: "Nothing new in {region} yet", then "Be the first: the cards you make public show up here for collectors in your region."
  - When Get started is not showing, the box also has an orange "Add cards" button.
  - This replaces the spec's empty text.
- **Nothing for one chip.** "No new cards in {region} in the last 30 days." ("No wishes…", "No deck cores…"), with a "Show all" link back to All.
- **First load.** Skeletons shaped like the page: two post outlines, each a circle with two lines, then four card-shaped boxes.
- **Errors.**
  - With nothing cached: "Couldn't load what's new." and "Try again".
  - While loading more: a "Couldn't load more" row at the bottom, with "Try again".
  - Offline with cached data: the cached page under the app's usual offline banner.
- **Refreshing.**
  - Pull to refresh.
  - Tapping the Home tab while on Home scrolls back to the top.
  - Coming back to Home refreshes when the data is more than 5 minutes old.
  - New posts never slide in while someone is reading.
- **A post that stopped being public** before it was tapped: the target screen's existing "no longer available" state. The feed drops the post on the next refresh.

## 5. The feed endpoint (adds to section 12)

GET /api/v1/feed?region=&game=&kind=ALL|NEW_CARDS|WANTED|DECK_CORES&cursor=&limit=, newest first with cursor paging, as the spec says. It also needs the following.

- **One game.** game= is the browsed game's slug and is required. New-card posts count only that game's cards, wishes are for that game's cards, and deck cores are binders of that game (binder.game_id, from stage G). A game with nothing in the window gives the empty state (10c) with "Nothing new in {game} yet".

- **A 30-day window.** The endpoint never returns anything older than 30 days. nextCursor is null at the end, and the phone then shows "You're all caught up". The 30 days is a server setting (an application property such as orenjitrade.feed.window-days=30), not a phone constant.
- **Every post** has:
  - id, stable across pages;
  - kind: NEW_CARDS, WANTED or DECK_CORE;
  - at: when it became public;
  - collector {handle, displayName, avatarUrl};
  - place {subdivisionName, countryName}. Never a city, never coordinates.
- **NEW_CARDS** posts have a total and up to 4 previews {itemId, cardId, printingId, name, printingCode, rarity, imageUrl, askingPriceText}. The phone needs itemId to pin a single card in the chat, and the code and rarity for the single-card row.
- **WANTED** posts have the fields the Wishlist segment's terms formatter reads, plus wishId, cardId, name and imageUrl.
- **DECK_CORE** posts have binderId, name, askingPriceText, photoUrl (the first photo), photoCount, previewImages (for a core without photos) and noteFirstLine (the note's first line, at most 120 characters).
- **What can appear.** The spec's rules, restated because they are the privacy core:
  - only public, fresh (ACTIVE or AGING) cards, public wishes (wishlist_visible on) and public, unsold deck cores;
  - only discoverable collectors of that region;
  - never the caller's own posts;
  - never a blocked pair in either direction, excluded in the SQL (DiscoverySql.notBlocked) before the limit, like every discovery list;
  - cards filed in a public deck core are not new-card posts, since the deck core post covers them (as excludeDeckCoreItems does for card holders).
- **Pictures.** Card pictures only through /api/v1/public/card-images/{id}; photos through the existing photo URLs. Never a provider URL.
- **Privacy test.** Add the feed to GeoPrivacyContractTest: every seed account, every kind.
- **Seed data.** The local seed shows every kind: groups of 1, 3 and 12 cards, wishes, and two deck cores (one with "Trade only"). Spread them over today, this week and this month, with times relative to now, so the feed isn't empty a month from now. All fictional.

## 6. Privacy and safety

The spec's sections 3 and 13 apply as they are. The feed adds two rules:
- your own cards, wishes and deck cores never appear on your Home;
- nothing sponsored and no ads (free for all, ADR 0019).

## 7. Tests and checks

- **API integration tests:**
  - each kind;
  - grouping per hour;
  - the 30-day window;
  - paging with no duplicate or missing post;
  - region scoping;
  - game scoping (cards, wishes and deck cores of another game never appear);
  - the caller left out;
  - blocks both ways, applied before the limit;
  - wishlist_visible off, a private card, a stale card;
  - cards in a public deck core;
  - a sold deck core gone;
  - GeoPrivacyContractTest.
- **Jest:**
  - time labels and section titles, including the day boundaries in the phone's time zone;
  - groups of 1, 2, 3, 4, 5 and 12 cards, and the "+n";
  - the wish terms;
  - the Get started rules, its hiding and the "Turn on" case;
  - the chips with their empty states;
  - the end text for each chip.
- **Maestro:**
  - the spec's walkthrough step 5: see a new card, a wish with "I have it", and a deck core;
  - tap a chip and reach the end of the feed;
  - Get started on a fresh account.
- **Before the PR:**
  - the handoff's whole check list;
  - simulator screenshots of 10, 10b (scrolled) and 10c in the report;
  - on this Mac, write "the Android run could not be verified".

## 8. Documents and the report

- docs/product/specs/2026-10-14-phone-redesign.md: add a dated note at the end ("Changed by the owner on 2026-10-19: Home") with what this prompt changes. Don't rewrite the saved sections.
- API contracts for the feed, IMPLEMENTATION_STATUS.md and the handoff's status table.
- List these defaults in the report so the owner can change them:
  1. the feed covers the last 30 days;
  2. Get started is hidden per account on this phone, not across phones;
  3. the chip choice goes back to All when the app restarts;
  4. the section titles are Today, Earlier this week and Earlier this month;
  5. Home refreshes on pull, and on return after 5 minutes.
```
