# Owner prompt 2026-10-19/20: finish the phone UI (stages G and R9 to R15)

Saved word for word from the owner's message of 2026-10-19 (prompt 2 of 2; it quotes the owner up
to 2026-10-20). Order of the stages (owner, same message): R6, then stage G, then R7 (with
[`2026-10-19-home-full-design.md`](2026-10-19-home-full-design.md)), then R8, then R9 to R15
(R15 after R12), one branch and one PR each. The mockup's version 50 is the owner's design canvas;
agents ask the owner for screenshots of the screens they need.

---

# Prompt 2 of 2: the rest of the phone (stages G, R9 to R15)

Prompt: finish the phone app's UI (mockup version 50, screens 31 to 75, plus changes to 10 to 18). It replaces bell-wanted-games-community.md.

Give it to your own Claude on the Mac. Stage G runs after R6 and before R7 (R7's Home prompt, home-full-design.md, uses it). Stages R9 to R15 run after R8 (R15 after R12), one PR each, in the same way as R1 to R8.

```text
You are working in the OrenjiTrade monorepo (CLAUDE.md, IMPLEMENTATION_STATUS.md and docs/development/claude-handoff.md first). The phone redesign (docs/product/specs/2026-10-14-phone-redesign.md) runs in stages R1 to R8. On 2026-10-19 the owner asked for more:

- "design notification button too. Add option yugioh, pokemon, one piece, magic and riftbound in this app. in message section, add a section for community by region, game,"
- about Community: "just a simple one".
- "remove page 32. remove page 33. On home page, remove "My games". Next to Americas(north), put a dropdown section button to select the game. Same in search section, on the right of search text at the top. You can remove the "All games" "yugioh" "pokemon" below the search bar. For the binder, it needs to section the game for the binder. So that, this idea make the user only see one game at the time, in home page and in search."
- "remove the wanted tab in the inventory section. I changed my mind." There is no Inventory › Wanted tab and no WANTED_ALERT: don't build them.
- "finish the rest of the ui in this application"
- On 2026-10-20: "I think that without log in. The user can still see home page and search? Can't see wishlist, invenstoryh and message and profile.. It might be good to require log in when they click tabs that needs to log in"

The design is the mockup https://claude.ai/artifact/7D7C3zyoabMbz47s3fCL1Q, version 50. Board numbers below are its titles:
- 31 Notifications; 32 Messages › Community; 33 a room; 34 Choose the game; 35 Choose the region;
- 36 to 46 sign-in, sign-up, the three welcome steps and the account states;
- 47 to 59 Settings and its pages;
- 60 to 69 report, rate, reference, new binder, add and edit a wish, import, a set;
- 70 to 75 browsing without an account: Home, the sign-in sheet, Search › Wishlist, Inventory, Messages and Profile as a guest;
- changed: Home (10, 10b, 10c) and Search (11, 12, 14, 15) have the game pill, Search typing (12) has no game chips, Inventory › Binders (17) is grouped by game, Edit binder (18) shows its game, Profile (21) links its gear and Edit profile.

Where this prompt and the mockup disagree on behaviour, this prompt wins. On looks and wording, the mockup wins.

## 0. How to work

- Eight stages, one branch and one PR each:
  - G One game at a time: after R6, before R7;
  - then, after R8: R9 Notifications, R10 Card data for Magic and Pokémon, R11 Messages › Community, R12 Sign-in and welcome, R13 Settings, R14 Report, rating, binders, wishes, import and sets;
  - R15 Browse without an account: after R12 (it needs Home from R7 and Sign in from R12).
- Run each stage the way the spec's section 15 says:
  - a new branch from the latest origin/main, in its own worktree, with your own database, Redis db and ports (the handoff's section 4), never the owner's ports (8080, 4200) or database;
  - a builder, then at least two independent reviewers: a functional verifier, and product and UX as a collector; add privacy for G, R11, R12, R13 and R15;
  - at most two fix rounds;
  - the handoff's whole check list before every PR;
  - a merge commit once CI is green.
- Extend what exists. The screens in R12 to R14 exist today and work: restyle them to the mockup and keep every function, state and error they have (spec section 2: features the mockup doesn't show stay, where they add the least clutter). Every screen keeps skeletons, an empty state and an error with "Try again".
- New Flyway migrations only. Fictional seed data only.
- On this Mac, write "the Android run could not be verified" in every report.

## G. One game at a time (34, 35, and changes to 10, 11, 12, 14, 15, 17, 18)

Games
- Yu-Gi-Oh!, Pokémon, Magic: The Gathering, One Piece and Riftbound.
- Add One Piece in a migration: slug onepiece, name "One Piece Card Game", short name "One Piece", ACTIVE, with a GameSchema (conditions like the other games; rarities C, UC, R, SR, SEC, L, SP, TR and P, checked against the official card list; parallel art is a variant of the printing with the same code).
- GET /api/v1/games gains hasCards: whether the catalog holds a card of that game.
- Monogram tiles go in packages/design-tokens, not in screens: Yu-Gi-Oh! Y #FDBA74 on #4A2A0A; Pokémon P #FDE68A on #3F3A12; Magic M #BFDBFE on #1E3A5F; One Piece O #FCA5A5 on #4A1D1D; Riftbound R #86EFAC on #1F3B2A.
- TCGplayer links (src/features/cards/tcgplayer.ts) add onepiece (one-piece-card-game) and riftbound (riftbound-league-of-legends-trading-card-game).

The browsed game
- Like the browsed region: phone state, remembered per account on the phone (AsyncStorage keyed by the user id; only the slug).
- Default: the first game of the collector's profile games that has cards, else Yu-Gi-Oh!.
- It scopes Home and every Search segment: the map counts, Search typing's suggestions, binders and deck cores of a state, binder search, and Search › Wishlist's list. Card holders are already scoped by their card.
- It does not scope Inventory › Cards (every game; its filter sheet keeps the game filter), chats or the bell.
- Every Search and feed endpoint the phone calls takes game= (the slug). Find them in src/features/search and the search module. Without game=, the endpoints behave as today (the paused web).

The game pill and its sheet (34)
- The pill: 36 tall, the 22 px tile, the game's short name, a chevron. Spoken "Game: {name}. Change game".
  - Home: right of the region pill (R7 builds Home with it).
  - Search: right of the "Search" title, before the bell, on every segment.
- The sheet "Choose a game", with "Home and Search show one game at a time.":
  - one row per game: the 38 px tile, the name, a line ("{n} of your cards", "None of your cards yet"), a radio;
  - a game without cards is dimmed with "Cards coming soon" and can't be picked;
  - picking closes the sheet and reloads; nothing else to confirm;
  - the footnote "Your inventory keeps every game, with binders grouped by game. Chats and the bell show every game."
- A game with nothing in the region gives each screen's empty state with the game's name (34 shows Home's: "Nothing new in {game} yet", "Add your {game} cards", "Switch game").

The region sheet (35)
- Restyle the existing switcher's sheet (src/features/regions/RegionBar.tsx): "Choose a region", "Home, Search and the map show one region at a time. Cards ship within a region.", one row per platform region with the globe tile, the name, a line ("Your region · Canada, United States, Mexico" for the home region, a few countries for the others) and a radio.
- When the browsed region isn't yours, the pill's border turns orange and "Not your region. Back to {home}" shows under the top row, as today's RegionAwayNote.
- The footnote "Your own region comes from Settings › Location. Browsing another one changes nothing on your profile."

Search
- Search typing (12): no game chips. The field says "{game} card name or code". Each result is only the card's name, the match in orange, with no count (owner 2026-10-14: no counts in search results). No match: "No {game} card matches “{q}”".
- The map (11): counts only binders of the browsed game. Spoken "Map of public {game} binders by state or province in {region}".

Binders have a game
- A migration adds binder.game_id (FK to game):
  - existing binders get the game most of their items belong to (a tie or an empty binder: the owner's first profile game, else Yu-Gi-Oh!);
  - items of another game leave that binder and stay in the inventory without a binder; log how many;
  - then game_id is NOT NULL.
  - Follow docs/database/schema.md, "Locks of binders and inventory items".
- POST /binders requires gameId: an ACTIVE game with cards.
- PATCH /binders/{id} can change gameId only while the binder holds no items. Otherwise 409 BINDER_GAME_LOCKED.
- Moving an item into a binder of another game: 409 BINDER_GAME_MISMATCH. The bulk MOVE_TO_BINDER reports it per item.
- Binder pickers on the phone list only binders of the card's game.
- Inventory › Binders (17): one section per game that has binders, in the games' order: the 22 px tile, the game's name, "{n} binders". Deck cores keep their purple badge. "New binder" opens 63 (built in R14; until then the current new-binder screen gains the Game picker).
- Edit binder (18): Name and Game side by side. The game is read-only with a lock, spoken "Game: {name}. It can't change once the binder has cards".

Tests
- The migration: majority game, ties, empty binders, items moved out.
- Binder rules: create needs a game with cards; the lock; the mismatch, single and bulk.
- game= on every Search endpoint and its count; nothing of another game leaks.
- GET /games hasCards.
- Jest: the default browsed game; remembering it per account; the sheet (dimmed games, picking); the binder sections.
- Maestro: switch Home to Pokémon and see the empty state, then back to Yu-Gi-Oh!; Search typing finds only the browsed game.

## R9. Notifications (31) and the bell

The bell
- On the top bar of Home, Search, Inventory, Messages and Profile. It opens Notifications.
- An orange dot while anything is unread. Spoken "Notifications, {n} new", or "Notifications" when nothing is unread.

The screen
- Top bar: back, "Notifications", and a gear that opens Settings › Notifications (51).
- "New" lists the unread ones, with "Mark all as read" (teal) on its right. "Earlier" lists the rest. Newest first, cursor paging.
- Each row: an icon tile in the kind's colours; "{bold subject} {rest of the sentence}"; one muted line; the time ("5 min", "1 h", "Yesterday", "Sat", then "Sep 30", in the phone's time zone); the card picture when there is one; an orange dot while unread.
- Tapping a row marks it read and opens its target:
  - WISHLIST_ALERT (orange heart): Who has this card (13) for that printing;
  - SALE_RECORDED (blue box): the chat;
  - RATING_RECEIVED (amber star): your ratings on your profile;
  - REPORT_DECISION (grey flag) and SYSTEM: no target.
- Old offer, trade, payment and dispute notifications (the paused web's) show with the grey icon and no target.
- Freshness reminders (BINDER_EXPIRING, BINDER_STALE_WARNING) are answered in place: "Still have them" calls POST /binders/{id}/confirm; "Review the binder" opens it; after a confirm the row shows a teal check and "Confirmed. They stay in search." BINDER_HIDDEN shows "Review the binder" only.
- Chats and Community posts are not listed (Messages has its own badge): add an optional excludeTypes parameter to GET /api/v1/notifications and its unread-count. The phone always sends excludeTypes=MESSAGE. Without it, both behave as today.
- Empty: "No notifications yet" and "We'll tell you when a card you want is listed in your region."
- A push notification opens the same target as its row.

Tests: Jest for kind to icon, colours and target, the time labels, the reminder's states; API for excludeTypes; Maestro: the bell from Home, a wishlist alert, "Mark all as read", "Still have them".

## R10. Card data for Magic and Pokémon

An owner step to run, as for Yu-Gi-Oh!. Agents never run a real import.
- Two CardProvider adapters with the YGOPRODeck adapter's etiquette. Seeds, tests and CI never call them; tests use small hand-written fixtures in the provider's format.
- Magic: Scryfall's daily bulk file "Unique Artwork". English paper cards; one image per artwork (illustration_id); printings are set code plus collector number. A User-Agent and an Accept header on every call; the bulk file instead of per-card calls; at most 10 API calls a second; refresh at most daily. Never crop, cover, recolour or watermark an image (resizing to the 320 px JPEG is fine). Never imply Scryfall endorses OrenjiTrade. Terms: https://scryfall.com/docs/api and https://scryfall.com/docs/api/bulk-data.
- Pokémon: TCGdex's card database (https://github.com/tcgdex/cards-database, MIT licence, keep its notice). Download it instead of one call per card. English only; one image per printing.
- Images follow ADR 0015 for every game: one 320 px JPEG per artwork in the same 5 GB cache; browsers only see /api/v1/public/card-images/{id}; provider URLs stay server-side. Expected: Magic about 1.9 GB, Pokémon about 0.85 GB, all five games about 3.5 to 4.2 GB.
- Commands for the owner, in the report: npm run catalog:import -- --game mtg --provider scryfall --images all; npm run catalog:import -- --game pokemon --provider tcgdex --images all; then npm run card-images:status.
- One Piece and Riftbound stay "Cards coming soon": One Piece needs Bandai's written permission (the official card list forbids reproduction; community APIs are scraped); Riftbound needs Riot's riftbound-content-v1 with an approved production key, kept on the server, with "Riot Games does not endorse or sponsor this project".
- Credits: add Magic and Pokémon to CARD_DATA_ATTRIBUTIONS (src/lib/cardImages.ts) and write docs/providers/scryfall.md and docs/providers/tcgdex.md like docs/providers/ygoprodeck.md. Magic: "Card data and images courtesy of Scryfall", with Wizards' Fan Content Policy notice. Pokémon: "Card data courtesy of TCGdex (MIT licence)", with "Pokémon card content is © The Pokémon Company, Nintendo, Creatures and GAME FREAK. OrenjiTrade is not affiliated with them." Mark the notices as drafts for the lawyer review.
- ADR 0020 "Five games and their card sources": the sources and terms, one image per artwork for Magic, English-only Pokémon, the copyright note for Pokémon images, why One Piece and Riftbound wait. Update ADR 0015 and CLAUDE.md's image rule to "Never hotlink provider images" for every provider.

Tests: each provider against its fixtures (printings, rarities, one image per artwork, nothing fetched in tests); hasCards turning true after a fixture import.

## R11. Messages › Community (32, 33): one simple room per game

- Messages (22) gets two tabs: Chats and Community. Chats has an orange dot while a chat is unread; the tab bar's badge counts chats only. Community shows while the publicChat flag is on; turn it on by default in a migration (it stays the kill switch).
- Rooms: one channel per platform region and game, 15 in all, created in a migration. Slug "{region}-{game}" (americas-north-yugioh), the game's name, the description "{game} collectors in {region}: trades and sales by mail." Archive the other channels (status ARCHIVED; nothing deleted).
- The list (32): the region pill, then the browsed region's five rooms, the browsed game's room first, then the others in the games' order. Each row: the tile and name; the last post ("{handle}: {text}", one line) and its time; bold with an orange dot when there are posts newer than your last visit on this phone. "No posts yet. Say hi!" when empty. At the end: "Every collector in {region} can read these rooms. Keep deals and addresses in private chats."
- A room (33): back, the tile, the name and "{region} · public room", an info button for "Room rules" (the mockup's rules, "You can post up to 10 times an hour in each room.", "Got it"). A banner: "Every collector can read this room. Keep deals and addresses in private chats." Posts read like a chat, newest at the bottom, with day separators: avatar, handle, "{province} · {time}" (never a city), text, up to 4 photos, a shared card (opens 13) or a shared binder or deck core (opens 16). No reply threads on the phone.
- "⋯" on a post: "Message {handle}" (a private chat without a pinned card), "Report this post", "Block {handle}" in red; on your own post, "Delete".
- The message box: "+" opens "Send a photo", "Share a card", "Share a binder or deck core"; "Write to the room"; the send button turns orange with text.
- Photos: up to 4 per post, 3 MB each (photos only, owner 2026-10-08), through POST /uploads/images with a new kind COMMUNITY, EXIF and GPS stripped; the post payload gains photos.
- Errors: 429 "You can post up to 10 times an hour in each room. Try again later."; 409 DUPLICATE_POST "You already posted this."; a network error keeps the text with "Try again". Blocked pairs, removed posts and suspended accounts stay hidden. Posts never notify.

Tests: the 15 rooms; archived channels gone; photo posts (count, size, EXIF stripped); blocks; GeoPrivacyContractTest for channels and posts; Jest for room order, unread dots, the send button, the post sheet; Maestro: open the Yu-Gi-Oh! room, post with a photo, report a post.

## R12. Sign-in, sign-up and welcome (36 to 46)

These screens exist ((auth), (account) and onboarding.tsx). Restyle them and keep their flows, errors and API calls. Changes:
- 36 Sign in: the wordmark and the line "Find collectors in your region who own, trade or want the cards you care about."; Email; Password with show and hide; "Forgot your password?" (teal, right-aligned under the password); "Sign in"; "or"; "Continue with Google"; at the bottom "New to OrenjiTrade? Create an account" and "Terms, privacy and community guidelines".
- 37 Create your account: Display name, Email, Password ("At least 8 characters."). The documents in one card: "Accept all", then one row per required document with a checkbox and "Read" (opens the document). The 18+ confirmation in its own card, English and French, never covered by "Accept all". "Create account" stays disabled until everything is ticked, with one line under it saying what's missing ("Accept the documents and confirm your age to continue.", "Accept every document to continue.", "Confirm that you are 18 or older to continue."). Keep the server checks. "Sign up with Google" goes to 43.
- 38 Reset password and 39 Verify your email: as today, with the sent state in place and "Resend in {n} s".
- 40 to 42 Welcome: three steps instead of four, with "Step {n} of 3" and a three-part bar.
  - The Age step leaves onboarding: sign-up (37) asks it, and an account whose ageConfirmed is false goes to Review our terms (43), which shows only the age line when no document is due. needsOnboarding keeps requiring ageConfirmed.
  - 40 "Who are you?": Handle with "@" and a live availability check (a teal check when free; "That handle is already taken. Try another one."), Display name, Bio (optional, 500); "Continue"; "Sign out".
  - 41 "What do you collect?": the five game tiles (two columns, multi-select; One Piece and Riftbound say "Cards coming soon" but can be picked); the first picked says "Opens first" and becomes the default browsed game; "Languages you trade in" chips; "Tags · optional" chips with suggestions (at most 12). "Continue" needs at least one game ("Choose at least one game."): Home and Search need one.
  - 42 "Where do you ship from?": "Collectors find binders by state or province. We never use GPS and never ask for your address."; Region; Country and State or province side by side; City (optional); the switches "Show my city on my profile" and "Show me on the map" (off by default, with its line); "Finish" and "Skip for now". Toast "Welcome to OrenjiTrade! Your profile is ready."
- 43 Review our terms: the due documents with their versions, each with a checkbox and "Read"; the age line when needed; "Accept and continue" disabled until all are ticked; "Sign out".
- 44 Suspended, 45 Scheduled for deletion ("Cancel deletion", "Download my data", then "Deletion cancelled", "Welcome back!" in place), 46 Could not load ("Try again", "Sign out"): as today, restyled, centred with a 72 px icon.

Tests: Jest for the sign-up button's states and its reason line, "Accept all" never ticking the age, the three-step flow and where it resumes, the age routing to 43; Maestro: sign up with every box, the three welcome steps, then Home on the first picked game.

## R13. Settings (47 to 59)

The gear on Profile (R6) opens Settings. These screens exist under app/settings and app/legal: restyle them and keep their behaviour.
- 47 Settings: a profile card (avatar, name, "@handle · Edit profile") that opens 48; groups "Where you ship from" (Location and discoverability with "{province}, {country} · On the map"; Shipping details), "App" (Notifications; Privacy; Appearance with its value), "Safety" (Blocked collectors with the count; My reports with "{n} waiting"), "Account" (Account with the email; Legal); a red "Sign out" row; the version line.
- 48 Edit profile: one page and one "Save changes" ("No changes yet" when clean), replacing today's separate saves for details and tags; the picture saves at once as today. "Preview" in the top bar opens the public profile. Picture, Handle, Display name, Bio, Games (the tiles of 41), Languages, Tags with "Add a tag" (12 at most). Toast "Profile saved." A leave guard for unsaved changes.
- 49 Location: the "Show me on the map" switch first, with "Collectors see you in {province}, {country}." or "You are hidden from the map and from searches."; Region; Country and State or province side by side; City; "Show my city on my profile"; the box "How OrenjiTrade protects where you live" with its three lines; "Remove my location" (red, with its sheet); "Save location".
- 50 Shipping details: as today (this phone only), restyled.
- 51 Notifications: Channels (In the app, Push, Email); Wishlist alerts; "What to notify me about" as a grid of topics (Messages, Ratings, Binder reminders, Report decisions, News and tips) by channel (App, Push, Email), a column dimmed while its channel is off; Quiet hours (switch, From and Until in 24-hour time, the time zone line); "Save preferences". Keep the no-location warning and the push note.
- 52 Privacy: "All changes saved" in the top bar; Visibility (Show me on the map, Appear in collector search, Let others see what you want, Show when I was last active, Show when I am online); Who can see your profile; Who can message you; Search (Remember my searches). Saved at once, as today.
- 53 Appearance: Theme (Same as the phone, Light, Dark); About (version, server, and the card data credits from CARD_DATA_ATTRIBUTIONS).
- 54 Blocked collectors, 55 My reports (pills: Open amber, Under review, Action taken teal, Dismissed grey), 56 Account (Verified, or Not verified with "Resend link"; sign-in method; member since; staff roles for staff only; Download my data; the red Delete account card; Sign out), 57 Delete account ("Delete my account" disabled until the confirmation is ticked; the sheet; the working steps; the blocked state; "You will confirm with Google." for Google accounts).
- 58 Legal: the English and Français switch, the draft banner, the documents. The phone lists Terms of Service, Privacy Policy, Community Guidelines, Trading safely, Marketplace Policy, Acceptable Use Policy and Cookie Policy. It leaves out Payment Protection Policy and Refund and Dispute Policy: the phone has no payments (ADR 0018); the web keeps them.
- 59 A document: as today. Trading safely is rewritten for shipping (spec section 11); keep the draft banner.

Tests: Jest for each restyled screen's states, the notification grid with a channel off, Edit profile's single save; Maestro: Profile gear, Settings, Location save, Privacy switch, Delete account up to the sheet.

## R14. Report, rating, reference, binders, wishes, import and sets (60 to 69)

These exist too (report.tsx, ratings/*, binders/new.tsx, wishlist/*, items/import.tsx, sets/[id].tsx). Restyle and keep their behaviour.
- 60 Report a collector: from the "⋯" of a profile, a chat or a community post. The person, the server's reasons as radio rows with their line, Details (1000), the confidentiality note, "Send report" (was "Confirm") disabled with "Choose a reason first.". Sent in place: "Report sent", "Done" and "Follow it in My reports". Keep the 409, 429 and self errors.
- 61 Rate a collector: from the sold note in chats (23, 24) and the sale notification. The person and the deal ("{card} · sold to you {date}"); Overall with 34 px stars and a word (Poor, Not great, Okay, Good, Excellent); Details (Communication, Card condition, Shipping) with clearable stars; Comment (600); "Your rating appears on {handle}'s profile with your name. You can change it for 14 days."; "Write a reference instead"; "Publish rating".
- 62 Write a reference: as today.
- 63 New binder: Name; Game (single-choice tiles; games without cards dimmed); Who can see it; Sell as a deck core; Cards inside, "Only your {game} cards can go in. Cards in another binder move here."; "Create binder".
- 64 Add a wish: "Add a wish" opens card search (12), and picking a card opens this form; "Change" goes back to search. The card (game, name, "{n} printings in the catalog"), Which copy, Near Mint only, "Price you would pay (optional)" as one-choice chips (No price, then the server's % TCG terms), Public note (280), "Add to wishlist".
- 65 Edit a wish: the same, with "Save changes" and a red "Remove from wishlist" with its sheet.
- 66 to 68 Import: the file step (a large dashed "Choose a file" with the limits, "Paste the text of the file instead", a row to switch to the Collectr CSV); the check step (a trash button to discard, with its sheet; chips All, "Which copy? {n}" and "Not recognised {n}"; an amber bar "{n} cards need a printing…" with "Use the newest"; rows with an include checkbox; the add button disabled with its reason); done ("{n} cards added", "They start private.", the not recognised list, "Go to my inventory", "Import another file"). Keep resuming an open import, the deck sections, the conditions sheet, the copies dialog, the expired and interrupted states, and the leave guard.
- 69 A set: the game, the name, "{CODE} · Released {date} · {n} printings", "Who has cards of this set" (today's "Search this set"), then a three-column grid of printings, each opening Who has this card at that printing; paged.

Tests: Jest for the report button, the star rows, the wish form's price chips, the import's blocked add button; Maestro: report from a profile, rate after Mark as sold, add a wish from search, import a small .ydk.

## R15. Browse without an account (70 to 75)

Looking is free; doing needs an account.

What a guest sees
- The app opens on Home for a signed-out visitor, not on Sign in.
  - The gate (src/account/gate.ts) sends `guest` to the tabs: GATE_HOME.guest becomes "/".
  - Guests may open (auth), Home, Search's Cards and Binders, card pages, Who has this card (holders), sets, the binders of a state (regions), a public binder or deck core, legal and Settings › Appearance. Everything else stays for members.
- Home (70):
  - a person button replaces the bell, spoken "Sign in", and opens 36;
  - a card above the chips: "You're browsing as a guest", "Create a free account to message collectors, save wishes and list your own cards.", "Create account" and "Sign in";
  - no Get started card and no Messages badge.
- Search has the same person button in place of the bell.
- A guest never sees who a collector is: posts and rows say "A collector" with a plain person avatar, then "{time} · {province}" as usual. The place stays.
- Inventory (73), Messages (74), Profile (75) and Search › Wishlist (72) stay in the tab bar. Each shows a page in place: an illustration, a heading, a line, "Create account" and "Sign in" (wording from the mockup). Profile also lists Appearance, Trading safely and Legal.
- Actions that need an account open the sheet of 71 instead of failing:
  - its title depends on the action: "Sign in to message this collector", "Sign in to tell them you have it", "Sign in to see collector profiles", "Sign in to save your wishes";
  - then "It's free. When you're done, you come right back here.", "Create account", "Sign in", "Not now";
  - it covers Message, I have it, a post's header, Add to wishlist and any other write a guest can reach.
- After signing in or creating the account (and the welcome steps for a new one), the phone goes back to where the guest was and finishes the action: the chat opens with the card pinned, the wish form opens, and so on.
  - Keep the pending action in memory only, by item, binder, wish or printing id.
  - Never use a collector id: guests never get one.
- Sign in (36) gains a close button at the top left, spoken "Not now, keep browsing", that goes back to where the guest was. Signing out lands on Home as a guest.
- A deep link to a member screen (a chat, a profile, a notification) opens Sign in and continues to the link after.
- The guest's browsed region and game stay on the phone under a guest key: only the two slugs, defaults americas-north and Yu-Gi-Oh!. Once signed in, the account's own remembered choice wins.

The API
- Discovery reads are already open to signed-out callers (SecurityConfig.PUBLIC_GET_PATTERNS; "reduced detail" in docs/api/contracts/phase4-map-search.md). Add the Home feed (GET /api/v1/feed, R7) to them, GET only.
- Add one rule to the privacy matrix (PrivacyPolicyService, the one place for it): a signed-out viewer never sees who a collector is.
  - It applies to every response a signed-out caller can get: the feed, card holders, binders and deck cores of a state, binder search, a public binder and its items.
  - Those responses leave out the collector's id, handle, display name and avatar, and the per-person details (rating, last active, presence). They keep the state or province and the country.
  - Collector name search returns nothing to a signed-out caller.
  - Reads by a handle the caller already has (/collectors/{handle}/binders and /inventory) stay as they are.
- Make those fields nullable in the OpenAPI contract and regenerate packages/shared-types and packages/api-client.
- Don't change the paused web. Check it still builds and its tests pass. If a web test fails only because it expects a signed-out visitor to see a name, list it in the report for the owner.
- Writes stay members only: 401 for signed-out callers, as today.
- Rate limits: RateLimitFilter already keys signed-out callers by address. Make sure a policy covers the open GETs (the feed, card holders, binder lists) with a short window.
  - The address is only a Redis key that expires with its window.
  - It is never stored, never logged with a place and never used for geography (ADR 0017).
- Anonymous answers may use the discovery cache, as the map counts do (DiscoveryCache).

Privacy
- GeoPrivacyContractTest gains a signed-out pass over every open endpoint: no coordinates (as for members), and no handle, display name, avatar or user id.
- The discoverability lines change:
  - 42: "Collectors of {region} can find your public binders in {province}. Visitors without an account never see your name. Off until you turn it on."
  - 49: "Collectors see you in {province}, {country}. Visitors without an account see your cards, never your name."
- The draft Privacy Policy says the same. Keep its draft banner for the lawyer review.
- Analytics events from guests carry no user id and no device id.

Tests
- API: each open endpoint signed out (identity fields absent, the place present, region= and game= respected); writes 401; the rate limit for signed-out callers.
- Jest: the gate for guests (allowed and member-only routes); the guest pages of the three tabs and Search › Wishlist; the sheet's title per action; the pending action resuming after sign-in and after the welcome steps; the guest's region and game; the person button.
- Maestro:
  - open the app signed out, search a card, open Who has it, tap Message, see the sheet, sign in, and the chat opens with the card pinned;
  - the Inventory tab as a guest;
  - Sign in's close button.

## Privacy and safety for every stage

- ADR 0017: places are a province or state and a country; never a city outside its owner's profile; never coordinates, distances or "near you" wording. New endpoints go into GeoPrivacyContractTest.
- Free for all (ADR 0019): no ads, nothing sponsored, the same limits for everyone.
- Deals ship by mail (ADR 0018): no meetup wording anywhere.

## Documents and the report, per stage

- The spec: a dated note at the end, "Changed by the owner on 2026-10-19", for each stage. Don't rewrite the saved sections.
- API contracts, IMPLEMENTATION_STATUS.md and the handoff's status table.
- Simulator screenshots of the stage's mockup screens in the PR.
- List these defaults in the report so the owner can change them:
  1. One game at a time on Home and Search (Search › Wishlist included); Inventory › Cards, chats and the bell show every game.
  2. The browsed game is remembered per account on the phone; it starts on the first profile game that has cards, else Yu-Gi-Oh!.
  3. Existing binders take the game most of their cards belong to; cards of another game leave the binder and stay in the inventory.
  4. A binder's game changes only while the binder is empty.
  5. Games without cards can't be browsed or hold binders, but can be on a profile.
  6. Welcome has three steps; the age is asked at sign-up or on Review our terms.
  7. Welcome needs at least one game.
  8. Edit profile has one Save.
  9. The phone's Legal list leaves out the payment protection and refund policies.
  10. Notifications leave out chats and Community posts.
  11. One room per game and region; old channels archived; publicChat on by default.
  12. One Piece and Riftbound wait for Bandai's permission and Riot's key; Magic keeps one image per artwork; Pokémon is English only.
  13. Guests see Home and Search with places but never a collector's name or picture; Inventory, Messages, Profile, Search › Wishlist and every action ask them to sign in.
  14. After signing in, the guest's action continues where it started.
  15. The app opens on Home for guests, and Sign in has a close button.
```
