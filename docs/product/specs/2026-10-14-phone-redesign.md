# Owner spec 2026-10-14: the phone redesign (mockup v32), stages R1 to R8

> Pasted by the owner on 2026-10-14 as the task for Claude Code. Authoritative for the stages R1
> to R8 of the phone redesign (see `IMPLEMENTATION_STATUS.md`, "NEXT TASK", and
> `docs/development/claude-handoff.md` for the stage plan and status). Saved here by stage S6 of
> the 2026-10-08 change, before R1 starts: nothing of it is built yet, and until a stage lands the
> other documents describe the phone as it is today. Kept verbatim; the mockup it names is the
> owner's artifact, its screens are kept outside the repository.

---

Prompt: build the approved phone redesign (mockup v32): five tabs with a Home feed, faster inventory, deck cores, map-first search, new profiles, and chat deals that ship by mail (offers removed)

```text
You are working in the OrenjiTrade monorepo: the Spring Boot API in apps/api, PostgreSQL/PostGIS and Redis in Docker, the Expo phone app in apps/mobile (checked on the iOS simulator the owner keeps booted, and on Expo web for the Playwright suite), and the Angular web app in apps/web-angular, which is paused. Build the phone redesign described below.

The owner approved this design on 2026-10-14 as the final UI ("I love your design! We should put in final"). The same day they removed "Make an offer" from the app and said deals ship by mail, with payment by e-Transfer. This redesign replaces the phone's current screens and the earlier redesign prompts (inventory-add-cards-redesign, deck-cores-marketplace). Where it contradicts CLAUDE.md, an ADR or a doc, update that document as part of the work and say so.

The source of truth is the clickable mockup at https://claude.ai/artifact/7D7C3zyoabMbz47s3fCL1Q (version 32, 25 screens; the numbers in brackets below are its screen numbers). You can't open it, but the owner can. This prompt describes every screen in words, with the approved copy in quotes. When a detail is missing, follow the pattern of the nearest screen, make a choice, and say what you chose.

## 0. Before you change anything

1. Read:
   - CLAUDE.md;
   - IMPLEMENTATION_STATUS.md ("NEXT TASK" and the owner orders);
   - docs/development/claude-handoff.md (working agreements, the checks before every PR, simulator rules);
   - ADR 0011, ADR 0015 and ADR 0017;
   - docs/api/contracts/phase8-offers-trades.md and docs/api/contracts/s5-inventory-import.md;
   - docs/product/specs/2026-10-08-have-want-regions.md.
2. Stage S6 (the final documents of the 2026-10-08 change) is the recorded next task. If it isn't merged, finish and merge it first. This work starts from a main that holds S5 and S6.
3. In the first stage, save this prompt verbatim as docs/product/specs/2026-10-14-phone-redesign.md ("kept verbatim", like the 2026-10-08 spec), and point IMPLEMENTATION_STATUS.md's NEXT TASK at it.
4. Inspect at least:
   - Phone:
     - navigation: src/navigation/tabs.ts, src/navigation/RootNavigator.tsx and app/(tabs)/*;
     - screens: app/cards/[id].tsx, app/holders.tsx, app/items/*, app/binders/*, app/wishlist/*, app/messages/[id].tsx, app/settings/*;
     - src/features: map, regions, catalog, search, inventory, binders, wishlist, messages, collectors, profile, settings, safety, notifications, offers, trades, payments, disputes, checkout, ads;
     - src/theme/* and src/api/hooks/*;
     - tests: __tests__, e2e and .maestro.
   - API:
     - messaging: V040, ConversationService, MessagePayload, SendMessageRequest;
     - ratings: V060, InteractionService, ConversationQualificationListener;
     - inventory: V022, InventoryService, inventory_item_image;
     - binders: V021;
     - wishlist: V112, WishlistAlertRules;
     - search: /search, /search/card-holders, /regions/{region}/binder-counts and the subdivision binders endpoint;
     - profiles: V004 tags and the collector profile;
     - notifications: NotificationType;
     - feature flags: V105;
     - seeds: db/seed and the *SeedContributor classes;
     - GeoPrivacyContractTest.
5. Extend working code. Restyle and reshape the existing screens and components rather than rebuilding them. Keep, exactly as the repo does them:
   - the modular monolith and REST /api/v1;
   - the generated OpenAPI and packages/api-client;
   - Problem Details errors;
   - RBAC and ownership checks;
   - feature flags and admin settings.
   Use new Flyway migrations only, numbered from V115.

## 1. What the owner decided (2026-10-13 and 2026-10-14)

- **Tabs.** Five tabs: Home, Search, Inventory, Messages, Profile. Home is a feed of activity in your region.
- **Inventory list.** Rows show only the picture, name, card code, asking price and copies.
- **Adding a card.** "Add cards" opens a page with search first, the deck and Collectr imports, and the camera marked "Coming later".
- **The card form.** Copies, Asking price (free text up to 40 characters, like "85% TCG"), Private/Public, Binder, Public note and up to 4 photos. Saving returns to Inventory with a "Saved" toast. Tapping a card opens Edit card directly. Deleting asks first and can be undone.
- **Deck cores.** A deck core is a binder with a "Sell as a deck core" switch: photos, one price and a note. Cards are optional ("Key cards").
- **Search.**
  - It opens on the region map, and results appear as you type.
  - Segments: Cards, Binders, Wishlist. No Filters button; the bell stays top-right.
  - No counts in search: no "N in your region", no printing counts, no holder counts, no "wanted by".
  - The card page has no card text and no type line, and has a "Check TCGplayer price" link.
- **Profiles.**
  - The collector's cards, binders and wishes come first, with little scrolling.
  - City, member since and last active sit on one small line, with the tags beside the avatar.
  - No location section. About and ratings go at the bottom.
- **Offers.** "Make an offer" is removed from the app, and with it trades, protected payments, checkout and disputes on the phone.
- **Shipping.** Deals ship by mail:
  - the buyer gives their address in the chat;
  - the buyer pays by e-Transfer outside the app;
  - the seller ships with tracking.
  There are no meetups and no game stores.

## 2. What stays as it is

- **The web app stays paused.** Don't change apps/web-angular, with the one exception in section 11 (the Trading safely text).
  - The web must keep compiling against the regenerated packages/api-client, and every web check in the handoff list must stay green.
  - So every API change is additive: new nullable columns or defaults, new endpoints, new optional parameters and fields. Never remove or retype a field the web reads.
- **Offers stay on the server.** The offers, trades, payments and disputes modules stay as they are, because the paused web uses them. Nothing on the phone calls them anymore. Deleting them later needs an ADR.
- **Skipped stages.**
  - Stage S3's "Who wants it", "Wanted by N" and holder counts are dropped by this design and are not to be built.
  - S3's search history becomes the phone's recent searches.
  - S4 (community photos) stays skipped.
- **Flags.** ML card scanning stays on hold. protectedPayments, premiumPlans, credits, donations and advertising keep their flags.
- **Everything else stays.** Features that the mockup doesn't show and this prompt doesn't remove stay, placed where they add the least clutter: reordering binders, resuming an import, the listings-paused banner.

## 3. Look and feel (every screen)

- The mockup is the dark palette that already exists in packages/design-tokens (color.dark: background #141210, surface #1E1B18, border #292524 and borderStrong #44403C, ink #F5F5F4, textMuted #A8A29E, primary #FF8F3D with onPrimary #2A1200, accent #2DD4BF, danger #F87171, online #4ADE80, and warning #FBBF24 for the rating star). Add one token family, deckCore (dark: tag background #2E2547, text #C4B5FD, switch #8B5CF6; pick matching light values). New installs start in dark; keep the System / Light / Dark choice in Settings and make every screen work in light too.
- Fonts: Sora for screen titles and big numbers, Inter for everything else, JetBrains Mono for card codes and tracking numbers. The phone doesn't bundle them yet (see src/theme/styles.ts): load them with expo-font and pin any font package you add.
- 16 pt side gutters, touch targets at least 44 pt, bottom sheets for pickers and confirmations (destructive buttons red), toasts at the bottom with an optional action ("Undo", "View") that stay about 5 seconds. Skeletons while loading, an empty state and an error state with "Try again" on every screen, VoiceOver / TalkBack labels on every icon button, text that survives larger font sizes.
- Places are always "{province or state}" or "{province}, {country}". The city appears only on its owner's profile while show_city is on (ADR 0017). No coordinates, distances or GPS anywhere.
- No counts in Search: no "N in your region", no printing counts, no holder counts, no "wanted by". Counts the design keeps: your own inventory summary, binder and deck core counts on the map, the number of your wishes on the Wishlist segment, unread chats, ratings.
- Copy below is the approved English text. Keep it in one place per screen so the French translation (on hold) can slot in later.

## 4. Navigation

Tab bar on every main screen, in this order: Home, Search, Inventory, Messages, Profile (src/navigation/tabs.ts today: Map | Inventory | Search | Messages | Wishlist | Profile). Messages keeps its unread badge (unread chats). The bell (the existing NotificationBell) sits top-right on Home, Search, Inventory, Messages and Profile.
The old Map tab becomes the default view of Search; the old Wishlist tab becomes the Wishlist segment of Search; the card detail (app/cards/[id].tsx) and the card holders screen (app/holders.tsx) become one card page, Who has this card (section 8). Keep old routes, universal links (/cards/, /collectors/, /binders/) and notification deep links working by redirecting them to the new places. Notifications stay in-app (realtime + the notification centre); push is not part of this work.

## 5. Home: activity in your region (mockup screen 10)

- Top row: the region switcher pill on the left ("Americas (North)" with a chevron, the existing M9 switcher), the bell on the right.
- A search field "Search cards or collectors"; tapping it opens Search with the keyboard up.
- Filter chips: All, New cards, Wanted, Deck cores.
- Section titles by time: "Today in your region", "Earlier this week", then older weeks. Newest first, cursor paging, pull to refresh.
- Three kinds of cards:
  - New cards: avatar, "{handle} listed {n} cards" ("listed {card name}" for one), "{time ago} · {province}", then up to 4 card pictures with the asking price under each; the 4th tile reads "+{n} more" when there are more. A picture opens Who has this card (13) for that card; the header opens the collector's profile (19). One collector's cards that became public within the same hour are one card.
  - Wanted: "Wanted · {handle} · {province}", the card picture and name, the wish terms ("Any printing · NM only · 85% TCG"), and an "I have it" button (section 10).
  - Deck core: "Deck core · {handle} · {province}", the first photo, the name and the price ("$95" or "Trade only"); opens the deck core page (16).
- Only public cards, public wishes and public deck cores of discoverable collectors in the selected region. Never your own, never a blocked collector (either direction).
- Empty: "Nothing new in {region} yet. Add your cards so others can find them." with an "Add cards" button.

## 6. Inventory and adding cards (mockup screens 1 to 9)

Inventory (1)
- Title "Inventory", the bell, an orange "Add cards" button.
- A switch "Cards {n} | Binders {n}".
- "Search your cards" field and a filter button that shows how many filters are on.
- Summary line "{n} cards · {n} copies · {n} public" and "Select" on the right.
- Rows show only: card picture, name, card code (mono), the asking price text on the right (nothing when empty) and "×{copies}". No set name, condition, sale/trade, public badge or want counts.
- Tapping a row opens Edit card (7). There is no view-only card page.
- Select mode keeps the existing bulk actions that still make sense: Move to binder, Make public, Make private, Still available, Delete (availability goes, see below).
- Keep ListingsPausedBanner and the freshness rules. Saving a card counts as "still available".
- The sponsored row in the mockup shows only while the `advertising` flag is on (off at launch).

Filter and sort, bottom sheet (2)
- Sort by: Recently added, Name, Price. Game: All games plus the games you own. Binder: All cards, No binder, then each binder by name. Who can see it: All, Public, Private.
- "Clear all" at the top, "Show {n} cards" at the bottom.
- Price sorts on the parsed amount; prices that are not a plain amount ("85% TCG", "Trade only") sort last.

Add cards (3)
- Back to Inventory, title "Add cards".
- A big search field "Card name or code, like LOB-EN001" with the hint "The fastest way to add one card. You pick the printing next."
- "Add many at once": "Import a deck" (".ydk file from YGOPRODeck or EDOPro") and "Import from Collectr" (".csv export. You check every match before it's added"). Both open the existing stage S5 import screens.
- "Scan with camera" ("Point at a card to add it") is disabled with a "Coming later" tag (ML on hold).
- Footer: "New cards start private. You choose what to publish."

Add cards, typing (4)
- Focused field with Clear, and "Cancel".
- "Cards": picture, name, "{game} · {n} printings", opens Choose the printing (5).
- "Exact printings" when the text looks like a code: code (mono), set name, rarity, opens Add to inventory (6) directly.
- Hint: "Tap a card to pick its printing, or an exact printing to go straight to the details."

Choose the printing (5)
- Back, title "Choose the printing", the card name, "{n} printings. Pick the one on your card.", a filter field "Set code or set name", rarity chips.
- Rows: code (mono), "{set} · {year}", rarity. A row opens (6).

Add to inventory (6)
- Header: game (caps), card name, "{code} · {set}".
- Fields in this order:
  1. Copies: − {n} +, at least 1.
  2. Asking price: optional free text, at most 40 characters, placeholder "85% TCG or 12.50".
  3. Who can see it: Private | Public, Private by default. Hint "Only you see it until you make it public." or "Collectors in {region} can find it."
  4. Binder: a picker, "No binder (unfiled)" by default.
  5. Public note: at most 500 characters with a counter, placeholder "NM, English, 1st, for trade".
  6. Photos: "{n} / 4", "Add photos", hint "Show the real card, front and back. Location data is removed."
- One button "Add to inventory", and under it "Change any of this later by tapping the card in Inventory."
- Saving returns to Inventory (8) with the toast "Saved · {card name}" and a "View" action that opens Edit card.
- Photos can be added while adding (today only after): create the card, then upload the photos; if a photo fails, keep the card and show "1 photo wasn't saved. Try again." on Edit card. Library and camera (expo-image-picker), up to 4, the existing 8 MB / JPEG-PNG-WebP rules and EXIF/GPS stripping.
- Gone from the phone's card forms (the API keeps the columns for the paused web, section 12): condition, language, edition, finish, "Available for", "Accepts offers", currency, "Temporarily public", private notes. Condition, language and edition live in the public note.

Edit card (7)
- The same fields as (6), filled in.
- At the bottom: "Save changes", disabled and reading "No changes yet" until something changes, and "Delete this card" in red text.
- Delete asks in a bottom sheet: "Delete {card name}?", "It leaves your inventory and any binder. Its photos are deleted too.", a red "Delete" and "Keep it".
- After Delete: Inventory (9) with the toast "Card deleted · {card name}" and "Undo". Undo restores everything: copies, price, note, photos and binder.

## 7. Binders and deck cores (mockup screens 16 to 18, and Search › Binders)

A deck core is a binder sold as one bundle. It needs no cards: photos, one price and a note are enough. Cards you do put in a deck core sell only together: they don't show as separate rows on Who has this card; the card page shows the core in "Also in a deck core" instead.

Inventory › Binders (17)
- Same header as Inventory, with the switch on "Binders".
- Summary "{n} binders · {n} deck cores" (drop the second part at 0), and a "New binder" button.
- Deck cores first: photo, name, "{n} photos · Public", and the purple tag "Deck core · {price}".
- Then binders: a fan of 3 card pictures, the name, "{n} cards · Public" or "· Private".
- A tip card at the end: "Selling a whole deck?" / "Turn on “Sell as a deck core” in a binder. Photos, a price and a note are enough."
- A row opens Edit binder (18).

Edit binder (18), also used for "New binder"
- Back, title "Edit binder" or "New binder".
- Fields: Name; Who can see it (Private | Public with the same hints as cards).
- A card with the switch "Sell as a deck core" and its hint "Photos, one price and a note". When it is on:
  - Photos "{n} / 4" with Add.
  - Asking price: at most 40 characters, placeholder "$180 or Trade only".
  - Public note: at most 500 characters, placeholder "What's in it, condition, language".
  - If the binder is private, the hint "Buyers can only find a deck core when it is public."
- Then a dashed section titled "Key cards · optional" when selling, or "Cards inside" when not, with "Add cards" (pick from your inventory) and the hint "Helps buyers find it when they search a card." or "No cards in this binder yet."
- "Save changes" (disabled until a change), and "Delete binder", confirmed in a sheet: "Delete {name}?", "Its photos, price and note go away. Your cards stay in your inventory.", a red "Delete binder" and "Keep it".

Deck core page, what buyers see (16)
- A full-width photo (about 360 pt tall) with page dots and "1 / 3", the back button over it.
- The purple tag "Deck core", the game, the name and the price in large type.
- Seller row: avatar, handle, "{province} · {n} public binders"; it opens the profile.
- The note.
- "Key cards" as chips "{card} ×{n}"; a chip opens Who has this card.
- A fixed bottom button "Message {handle}" that opens the chat with the deck core pinned.
- Plain public binders keep the existing public binder screen, restyled to this look.

## 8. Search (mockup screens 11 to 15)

Map (11)
- Title "Search" and the bell. Segments: Cards | Binders | Wishlist (Wishlist shows how many wishes you have).
- The search field "Card name or code, like LOB-EN001"; tapping it opens (12).
- Under it the M9 region map in dark: states and provinces shaded by public binder counts, legend "Public binders": None, 1, 2–4, 5–9, 10+.
- Over the map: the region pill top-left, and on the right "My province" (centres on your declared province, never on a device location) and zoom + / −. The map opens centred on your province.
- Tapping a state opens a card with the state and its country, "{n} binders · {n} deck cores" (only the parts above 0; "No public binders here yet" when there are none), a "See binders" button (the Binders segment filtered to that state) and a close button.
- No Filters button on Search.

Typing a card (12)
- Focused field with Clear, and "Cancel".
- Game chips: All games, then the games in the catalogue (Yu-Gi-Oh!, Pokémon, Magic).
- Results as you type: card picture, the name with the typed part highlighted, the game. Nothing else.
- A result opens Who has this card (13).
- When the text matches a collector's handle or name, a short "Collectors" section under the cards (at most 3 rows: avatar, handle, province) opens their profile. That keeps Home's "Search cards or collectors" true now that the Collectors segment is gone.
- The card filters sheet (set, language, edition, rarity) goes; game chips are the only filter.
- Empty box: "Recent searches", "Clear", up to 8 recent searches (tap to search again), and the line "Only you see your searches. You can turn this off in Settings › Privacy."
- No match: "No card matches “{text}”" and "Try fewer letters, or the code printed on the card, like LAVD-EN008."

Who has this card (13), the one card page (replaces app/cards/[id].tsx and app/holders.tsx)
- Top row: back, and a toggle button "Add to wishlist" / "On your wishlist" (teal when on). Adding creates an "Any printing" wish without terms; the collector refines it in Wishlist.
- Gone from the phone's card page: card text, type line, attributes, the "Selected printing" block, market prices, the holder filters sheet, "Make an offer" and "View binder" on rows.
- Card header: picture, game in caps, name, and a link "Check TCGplayer price" with an external-link icon. It opens TCGplayer's search for the card name in the browser (https://www.tcgplayer.com/search/{yugioh|pokemon|magic}/product?q={name}). Nothing is fetched from or stored about TCGplayer.
- No card text and no type line (no Monster / Tuner / Effect).
- An "Any printing ▾" button opens a sheet of the card's printings ("{code} · {rarity}") that filters the rows.
- If public deck cores in the region contain the card: a banner "Also in a deck core" with "{core} · {handle} · {province} · {price}" that opens the deck core page (at most 3).
- Holders grouped by province: yours first, titled "{province} · your province", then the other provinces of your country, then the rest of the region. Newest listing first inside a group.
- Row: avatar and handle (open the profile), "{code} · {rarity}", the asking price text, "×{copies}", and a round Message button that opens the chat with that card pinned.
- No counts anywhere on this page.
- Empty: "Nobody in {region} lists this card yet." with the wishlist button as the next step.

Binders (14)
- A field "Deck, binder or collector, like Yubel". It matches binder names, handles and, for deck cores, their key cards.
- A chip with the state when you came from the map ("Quebec" with ×, back to the whole region), otherwise a "Pick on the map" link.
- Segments "Binders | Deck cores".
- Deck core rows: a 56 pt photo, the name, "{handle} · {province}", the price. Binder rows: a fan of 3 cards, the name, "{handle} · {n} cards".
- Empty states: "No public binders here yet.", "No deck cores for sale here yet.", "Nothing matches. Try a deck name, a card name or a collector."

Wishlist (15)
- A switch row "Tell me when someone in my region lists one" (the stage S2 account-wide alert setting).
- "Add a wish" opens the card search, then the S2 wish form (printing, public note, Near Mint only, % TCG).
- Rows: picture, name, the terms ("Any printing · NM only · 100% TCG", "TN19-EN013 · NM only"), and on the right "Available" in orange when at least one public holder in the region has a matching printing (it opens Who has this card filtered to that printing), otherwise "None yet" in grey.
- Tapping a row edits the wish (the existing WishFields form). No counts.
- The alert switch is the same setting as today's switch in Settings › Notifications. "Let others see what you want" moves to Settings › Privacy; plan usage notices show only when a plan limit is near.

## 9. Profiles (mockup screens 19 to 21)

Another collector's profile (19, 20)
- Top bar: back and "⋯" (sheet: Share profile, Report, Block).
- Header: a 64 pt avatar with the online dot; the name; "@{handle} · ★ {rating}" (the star scrolls to the ratings); the chips beside the avatar, games first in orange tint, then tags.
- One small line under it: "{city, }{province} · Member since {year} · Active this week" (the city only while show_city is on; "Active this week" or "Active this month", nothing when older).
- One orange button "Message {handle}".
- Sections in this order, each with "See all": Cards (a sideways rail of card tiles with the price under each); Binders (sideways tiles: deck cores with their photo and the purple "Deck core · {price}" tag, binders with a card fan and "{n} cards"); Looking for (their public wishes: picture, name, terms, an "I have it" button); About (the bio); Ratings & references ("★ {rating} · {n} ratings", the 2 latest references with handle, month and text, "See all references").
- The location section is gone.

Your Profile tab (21)
- Top bar: "Profile", the bell and a gear that opens Settings.
- The same page others see, with "Edit profile" and "Share profile" instead of Message, your wishes without "I have it", and "See all" leading to your Inventory, Inventory › Binders and Search › Wishlist.
- Settings loses Offers and Payouts. Premium, Credits and Support OrenjiTrade move from the Profile tab into Settings and stay hidden while their flags are off. Add Settings › Privacy › "Remember my searches" and "Let others see what you want", and Settings › Shipping details (section 10).

## 10. Messages: every deal happens in the chat, and cards ship by mail (mockup screens 22 to 25)

How deals work (owner, 2026-10-14): collectors don't meet. They agree in the chat, the buyer sends their address, the buyer pays the seller by Interac e-Transfer outside the app, the seller ships with tracking and taps Mark as sold, then both rate each other. OrenjiTrade never handles the money.

Inbox (22)
- Title "Messages" and the bell.
- Rows: avatar with the online dot, handle, time ("2 min", "1 h", "Yesterday", "Mon", "Sep 28"), the last message ("You: " before yours), and on the right the picture of the card (or the deck core photo) the chat is about.
- Unread chats: bold text, orange time and an orange dot. Muted chats keep the muted icon.
- Empty: "No messages yet. Find a card in Search and message its owner."
- Community channels: while the `publicChat` flag is on, keep today's Inbox | Community switch above the list; while it's off (as in the mockup), no switch.

Chat (23 buying, 24 selling)
- Top bar: back; avatar, handle and a status line "Online · {province}" or "{province}" (never the city) that opens the profile; "⋯" (sheet: Rate {handle}, Mute, Archive, Report {handle}, Block {handle} in red).
- Pinned bar: the card or deck core the chat is about (picture, name, "{code} · {rarity}", the price).
  - The other person's card (you are buying): the price on the right; the bar opens Who has this card or the deck core page.
  - Your card (you are selling): "· your card" at the end of the line and a teal "Mark as sold" button. After a sale it shows a "Sold" tag.
- A small safety tip with a shield icon at the top of every new chat:
  - Buying: "Check their rating before you send an e-Transfer, and ask for tracking."
  - Selling: "Ship after the e-Transfer arrives, and add the tracking number when you mark it sold."
  - A chat without a card: "Agree on the price and shipping here. Check ratings before you send an e-Transfer."
  This replaces the old meetup notice in conversations.
- Bubbles: yours orange on the right, theirs dark on the left; line breaks kept (addresses); day separators and times; shared cards (picture, name, code, price), shared binders and photos.
- Quick replies in one sideways row above the message box; one tap sends.
  - Buying, until the seller has replied: "Is it still available?", "How much with shipping?". After: "e-Transfer sent!", "Tracking number?", "Thanks!".
  - Selling, until you have replied: "Yes, still available", "Send me your address". After: "Got your e-Transfer", "Shipped!", "Thanks for buying!".
  - Hide a reply once you have sent that exact text in this chat.
- Message box: "+", a "Message" field, and a send button that turns orange when there is text.
- The "+" sheet:
  - First row by side: buying "Send my address", selling "Send my e-Transfer email" (both when the chat has no card), each with the sub-line "Saved on this phone only".
  - Then "Send a photo", "Share a card from your inventory", "Share a binder", "Cancel".
  - The first time, "Send my address" asks for the address in one multi-line field, and "Send my e-Transfer email" asks for the email or phone number. Both stay only on the phone (secure storage), are editable in Settings › Shipping details, and never reach the server except inside a message you send.
  - Tapping puts the text in the message box so you can check it before you tap send.
- "Make an offer" and "Share an offer" are gone. Old offer messages show as a grey line "Offer (no longer available)".

Mark as sold (25), seller only
- A sheet titled "Mark as sold?".
- The card row: picture, name, "{code} · {n} copy" or "copies". A "Copies sold" stepper when you have more than one.
- "Tracking number · optional": a mono field with the placeholder "So {buyer} can follow the package".
- The text "Sold to {buyer}. It was your last copy, so the card leaves your inventory. You can rate each other next." (or "You'll have {n} left." when copies remain).
- An orange "Mark as sold" and "Not yet".
- Afterwards:
  - The toast "Marked as sold" with "Undo", and the pinned bar shows "Sold".
  - A system message both sides see: "You marked {card} as sold to {buyer}." for the seller and "{seller} marked {card} as sold to you." for the buyer, with "Tracking {number}" when given and a "Rate {other}" button.
  - The copies sold leave the inventory. At 0 the card leaves the inventory and its binder. For a deck core, the core and the cards in it leave Search and the inventory.
  - The buyer gets an in-app notification "{seller} marked {card} as sold to you" that opens the chat.
  - Both can rate each other right away (the existing rating and reference flow).
  - Undo (from the toast, and accepted by the server for 10 minutes) puts the copies back, removes the system message and the rating right this sale gave.

Starting a chat
- There is one chat per pair of collectors.
- "Message" on a holder row (13) or on a deck core page (16) opens or reuses that chat and pins that card or core (the latest one wins).
- "Message {handle}" on a profile opens the chat without changing its pinned card.
- "I have it" (Home and profiles) opens or reuses the chat with that collector, with "I have {card} for your wishlist. Interested?" in the message box. If your inventory holds that card, it becomes the chat's card (you are the seller), and sending shares your card first, then the text, as in screen 24. Nothing is sent until you tap send.

## 11. Offers leave the phone, and the wording becomes shipping-first

Remove from the phone. Delete the code (git history keeps it):
- Offers:
  - app/offers/*, src/features/offers and src/api/hooks/offers.ts;
  - "Share an offer" and the offer card in src/features/messages (MessageComposer, LinkPickers, LinkCards, messageDraft);
  - "Make an offer" on holder rows, public binder cards and profiles;
  - Settings › Offers (app/settings/offers.tsx), and the Profile tab's Offers row.
- Trades: app/trades/*, src/features/trades and the trades hooks, and the Profile tab's Trades row.
- Protected payments and checkout: src/features/payments, src/features/checkout, app/checkout/fake/[ref].tsx, Settings › Payouts (app/settings/payouts.tsx) and the payments hooks. The premium, credits and donations checkouts stay behind their flags, with their tests.
- Disputes: app/disputes/*, src/features/disputes.
- Their tests:
  - the unit tests of these features;
  - e2e/offers.spec.ts, e2e/payments.spec.ts and the "Make an offer" check in e2e/holders.spec.ts;
  - the Maestro flows offer-trade-rating.yaml and payment-protection.yaml, with .maestro/scripts/offers.js and payments.js.
- Old messages and notifications:
  - Old offer and trade notifications open the chat with that collector, or nothing.
  - Old OFFER_LINK messages and old offer or trade system messages show as a grey line.
- Write ADR 0018 "Deals happen in the chat". It covers:
  - offers leave the phone, and the server modules stay for now;
  - Mark as sold records a sale between two collectors;
  - ratings come from sales and conversations;
  - payment stays outside the app: no escrow, and no claim of protection;
  - cards ship by mail.

Replace the meetup wording on the phone, in the API and in the seeds:
- **Chat safety notice.** The conversation copy of src/features/safety/TradingSafetyNotice.tsx becomes the per-side tips of section 10; the trade copy goes with trades. Update the tests that pin the wording: __tests__/features/safetyNotice.test.tsx, e2e/safety-notice.spec.ts and .maestro/safety-notice.yaml.
- **Meetup line.** Remove "Meetup details always stay private between the two of you." from app/messages/[id].tsx and InboxView.tsx.
- **Ratings.** The phone stops asking "Meetup reliability" (src/features/collectors/ratingLabels.ts). It keeps Overall, Communication, Condition accuracy and Shipping. The API column stays.
- **Profile tags.**
  - A migration sets the local-meetups tag to HIDDEN.
  - Seed profiles 01 and 07 use shipping instead.
  - Update TagPicker's hint, SeedIT, TagIT and docs/development/seed-data.md.
- **Seeds (fictional data).**
  - Rewrite the meetup and game store lines in db/seed/inventory.json, MessagingSeedContributor, CommunitySeedContributor and OfferSeedContributor as shipping and e-Transfer lines.
  - Put no addresses in seeds: GeoPrivacyContractTest would flag the city.
- **API text.**
  - A migration rewrites the region channel descriptions ("trades, meetups, locals", from V041 and V110).
  - ReportReason drops "including at meetups".
- **Trading safely page.** This is the one exception to the web pause, and the owner allows it.
  - Its text lives only in apps/web-angular/src/app/features/legal/legal-content.ts and legal-content.fr.ts. The phone's copies are generated from them by npm run sync:legal.
  - Edit only the trading-safely section of those two files, in English and French, then run npm run sync:legal in apps/mobile.
  - New content:
    1. Deals ship by mail.
    2. OrenjiTrade never handles the money: payment happens outside the app, for example by Interac e-Transfer.
    3. Before paying, check the collector's ratings and references, and ask for photos of the real card.
    4. Sellers ship once the payment arrives, with tracking, and add the number when they mark the card sold.
    5. Share your address only in the chat with the person you deal with.
    6. Warning signs: pressure, a payment method other than the one agreed, gift cards or crypto, a price far below market, refusing tracking.
    7. How to report and block.
  - Keep the draft banner, and don't claim legal compliance.
  - Leave the Terms, Community Guidelines and Payment Protection clauses as they are. List their meetup wording for the lawyer in the stage report.
- **Docs.** docs/product/product-overview.md and CLAUDE.md (the mobile tabs line, the product summary, the module list if you add one): deals ship by mail, the five tabs, no offers on the phone.

## 12. API and database (all additive)

Inventory
- **Price text.** A migration adds inventory_item.asking_price_text varchar(40), nullable and trimmed.
  - When the text is a plain amount ("12.50", "$12.50", "12,50 $"), also fill asking_price and currency (the currency the phone uses for the account today, CAD by default).
  - Responses gain askingPriceText, and the phone shows the text exactly as typed.
  - Price sort keeps using asking_price.
- **Fields the phone no longer shows.**
  - Cards added on the phone get availability TRADE_OR_SALE and accepts_offers false, and the phone never changes them afterwards.
  - Language, edition and finish take the game's defaults.
  - Condition is "not stated":
    - Make condition nullable if the paused web still compiles and passes its tests; otherwise pick the least misleading option and say which.
    - WishlistAlertRules treats a not-stated condition as a possible match for Near Mint only wishes; the buyer checks in the chat.
- **Photos while adding.** Create the card with POST /items, then upload with POST /items/{id}/images (existing).
- **Undo a delete.** Add POST /api/v1/inventory/items/{id}/restore, allowed for 10 minutes after the soft delete (deleted_at exists). Photos are purged only after that window.
- **Freshness.** Saving from Edit card also confirms freshness, as POST /items/{id}/confirm does.
- **Filters.** "Recently added" sorts by creation (add sort=created if needed). "No binder" uses unfiled=true.

Binders and deck cores
- **New binder columns:** sells_as_core boolean default false, asking_price_text varchar(40), asking_price numeric(12,2) with currency (parsed as for cards), and sold_at timestamptz.
- **The note.** binder.description becomes the deck core's public note; the phone caps it at 500.
- **Photos.** A binder_image table like inventory_item_image (at most 4, the same upload rules), with POST and DELETE /api/v1/binders/{id}/images.
- **Summaries.** Binder summaries gain previewImages: up to 3 item pictures, or the first photo for a deck core.
- **Public responses.** collectors/{handle}/binders, public/binders/{id} and search gain sellsAsCore, askingPriceText, photos and keyCards [{cardId, name, quantity}], built from the binder's items.
- **Who has this card.**
  - Items in a public deck core are left out of /search/card-holders when the new optional excludeDeckCoreItems=true is passed (the phone passes it).
  - New: GET /api/v1/search/deck-cores?cardId=&region=&limit=3 lists the public deck cores in the region that contain the card.
- **Binder search.**
  - /api/v1/search (types=binders) and /regions/{region}/subdivisions/{code}/binders gain the optional deckCore (true or false) and q.
  - For deck cores, they also match key card names.
- **Map counts.** /regions/{region}/binder-counts gains deckCoreCount per subdivision.

Search, wishlist and recent searches
- **Card search.** The phone's search asks for cards, and for collectors while typing. It ignores printingCount and cardType.
- **Wishlist availability.** GET /api/v1/wishlist items gain available (boolean). A wish is available when an item matches the wish's card and its printing or rarity, and the item is:
  - public, and ACTIVE or AGING;
  - owned by a discoverable collector in the same region;
  - not blocked, and not yours.
  Compute it with one grouped query, not one query per wish.
- **Recent searches.** They stay on the phone; there is no server history. Settings › Privacy › "Remember my searches" (on by default) clears and stops them when turned off.

Messaging and sales
- **Chat subject.**
  - New conversation columns: subject_item_id (FK to inventory_item, nullable) and subject_binder_id (FK to binder, nullable), at most one of them set, plus subject_set_at.
  - POST /api/v1/conversations accepts an optional subjectItemId or subjectBinderId. It creates or reuses the pair's chat and pins that subject, which must be public or yours.
  - ConversationSummary and the conversation response gain subject {kind CARD|DECK_CORE, id, ownerId, name, printingCode, rarity, imageUrl, askingPriceText, sold, listed}.
  - When the subject stops being public (made private, deleted or sold), the other person still sees its name and picture, marked "No longer listed" and without a price.
- **Sharing your card.** SendMessageRequest (in MessagingRequests) gains an optional inventoryItemId for CARD_LINK. It shares your item (picture, code and price) and pins it as the chat's subject. Sharing a private card shows it to that person only.
- **Sales.**
  - Add a sale table, for example: id, conversation_id, seller_id, buyer_id, inventory_item_id or binder_id, quantity, tracking_number varchar(64), created_at, undone_at.
  - POST /api/v1/conversations/{id}/sales {quantity, trackingNumber?} is for the seller only: the subject must be theirs. It returns 409 when no copies are left.
  - POST /api/v1/sales/{id}/undo is for the seller, within 10 minutes and before anyone has rated the sale.
  - Marking a card sold lowers its copies, and soft-deletes the item at 0 (as TradeService.finish does today).
  - Marking a deck core sold hides the core (sold_at) and soft-deletes its items.
  - Undo restores exactly what was there.
- **Sale message.**
  - Each sale posts a SYSTEM message with a sale payload {saleId, sellerId, buyerId, name, trackingNumber, undone} and a neutral body for other clients.
  - The phone words it for each side.
  - Deduplicate it with systemKey sale:<id>:SOLD. Undo marks it deleted.
- **Ratings.** Add an InteractionKind SALE (subject_type SALE), recorded for each sale, so both sides can rate right away. Undo removes it while it is unrated.
- **Notification.** A new type for the buyer, "{seller} marked {card} as sold to you", that opens the chat. In-app only.
- **Module.** Choose the module that owns sales; a new deals module is the natural fit, so update CLAUDE.md's module list. Make cross-module calls through services and events, as CLAUDE.md says.

Home feed
- GET /api/v1/feed?region=&kind=ALL|NEW_CARDS|WANTED|DECK_CORES&cursor=&limit=, with cursor paging and newest first. It returns:
  - new public cards (from listing_changed_at and publicly_listed), grouped per collector per hour, each group with up to 4 previews and a total;
  - public wishes (owners with wishlist_visible on);
  - deck cores that became public.
- Rules:
  - only discoverable collectors of that region;
  - never the caller, and never a blocked pair;
  - places as "State, Country", never a city.
- Add every new response family to GeoPrivacyContractTest: feed, deck cores, conversation subjects, sale messages and wishlist availability.

## 13. Privacy and safety

- **Places.** ADR 0017 holds: provinces only outside the owner's own profile, no coordinates, no geocoding.
- **Saved details.** The saved address and e-Transfer email live only in the phone's secure storage: expo-secure-store, with an in-memory or localStorage fallback on Expo web for tests.
  - They are sent only inside a message the user sends.
  - They are never logged and never in analytics.
  - An address typed in a chat is the user's own message. The app never parses it, stores it anywhere else or geocodes it.
- **Tracking numbers** are visible only to the two collectors (and to admins handling a report, as for messages). They never appear in analytics or logs.
- **No protection claims.** The app never claims buyer protection, escrow or guarantees.
- **Moderation.** Rate limits and banned-term checks apply to quick replies and saved texts like any message.

## 14. Tests

API
- Unit tests for the pure rules: price text parsing, deck core visibility and key cards, sale quantities and the undo windows, feed grouping, wishlist availability.
- Testcontainers integration tests for every new or changed endpoint, with authorization:
  - only the seller marks sold;
  - only the owner edits a deck core;
  - blocked pairs;
  - private subjects.
- Extend GeoPrivacyContractTest. Test migrations the way the repo does.

Phone
- Unit tests for the screens and rules: which side you are on, which quick replies show, the + sheet for each side, toasts and undo, how prices display.
- The Expo web Playwright suite for every flow.
- Maestro flows on the owner's booted iOS simulator (ORENJI_IOS_SIMULATOR_UDID; never boot, erase or shut down a simulator):
  1. Add a card with a text price and a photo, see "Saved", edit it, delete it, and undo.
  2. Make a binder a deck core with photos and a price. Find it in Search › Binders › Deck cores and on the map's state card.
  3. Search a card, open Who has this card, message a holder, and see the card pinned and the buying tip.
  4. As the seller, send your e-Transfer email from the + sheet, mark the card sold with a tracking number, undo, mark it sold again, and rate.
  5. On Home, see a new card, a wish with "I have it", and a deck core.
  6. The profile pages and the Settings gear.

Removed features and the web
- Remove the tests of the removed features.
- Keep the web suites green, untouched.
- If Android can't be checked, say "could not be verified on this machine" in the report. Never skip it silently.

## 15. Stages: one branch and one PR each, in this order

Use the same process as stages S1 to S6 (see the handoff):
- a separate worktree;
- the builder, then at least two independent reviewers who run everything themselves: a functional verifier, plus a second lens (privacy for R4, R5 and R7; product and UX as a collector for R2, R3, R5, R6 and R7);
- at most two fix rounds;
- the handoff's full check list before every PR;
- a merge commit once CI is green, then the next stage from the new main.

The stages:
- **R1. Offers out, shipping wording, look.** Everything in section 11 (including ADR 0018 and the saved spec), plus the section 3 look: new installs start in dark, the new tokens, the fonts. The tab bar keeps today's tabs until R5.
- **R2. Inventory and adding cards** (screens 1 to 9): the price text, photos while adding, undo.
- **R3. Binders and deck cores** (16 to 18, and Inventory › Binders): the binder fields, photos and the deck core page. Its Message button opens the chat without a pinned card until R4.
- **R4. Messages and Mark as sold** (22 to 25):
  - chat subjects and the inbox thumbnails;
  - the pinned bar, tips and quick replies;
  - the + sheet, with Settings › Shipping details;
  - sales, undo, ratings and the buyer's notification.
- **R5. Search** (11 to 15):
  - the Map and Wishlist tabs move into Search, which leaves four tabs;
  - the map with deck core counts, and typing with collectors;
  - the one card page, Who has this card, with Message on its rows and "Also in a deck core";
  - Binders with Deck cores, Wishlist with Available, recent searches.
- **R6. Profiles** (19 to 21) and Settings behind the gear.
- **R7. Home** (10) and the feed endpoint. Home becomes the first of five tabs.
- **R8. Wrap-up.**
  - Docs: CLAUDE.md (tabs and modules), the product overview, API contracts for the new endpoints, the test accounts and seed data docs.
  - IMPLEMENTATION_STATUS.md.
  - A walkthrough of every mockup screen on the simulator, with a screenshot of each in the PR.
  - The exact next task.

## 16. Defaults chosen for the owner

Build these, and list them in each report so the owner can change them:
1. New installs start in dark.
2. Recent searches stay on the phone; there is no server history.
3. The saved address and e-Transfer email stay on the phone, and go into the message box to be checked before sending.
4. Undo:
   - a deleted card can be restored for 10 minutes;
   - a sale can be undone for 10 minutes, and only before anyone has rated it.
5. Cards added on the phone have no stated condition; Near Mint only alerts still fire for them.
6. A sold deck core is hidden, and its cards leave the inventory.
7. The card search also lists matching collectors.
8. There is one chat per pair of collectors; the latest card or deck core opened from Search becomes its pinned card.
9. TCGplayer links use the game's search page, and /search/all for a game TCGplayer has no category for.
10. The quick reply wording in section 10.

The owner questions left open by S5 (the default condition of imported cards, inventory.items.max) stay open.

## 17. Done means

A stage is done when:
- its screens match the descriptions in this prompt;
- they work end to end against the local API, with authorization, validation, empty and error states, and tests;
- the full check list is green;
- the reviewers passed it.

After each stage, report in plain language:
- what changed;
- how it was verified, with simulator screenshots;
- what could not be verified;
- the defaults you chose;
- placeholders left for the owner or the lawyer;
- the exact next task.

Keep the repository buildable at the end of every session.
```

---

## Changed by the owner on 2026-10-16

After stages R2 and R3, the owner asked for two changes to the Inventory and the card form
(mockup version 43, screens 1, 6, 7, 8 and 9): _"I think that on page 1, the cards should show if
it's public or private. on page 7, when I type the price, it should be in $. or have option to
chose %tcg"_. The prompt above is kept as it was; these two points replace what it says about
them (section 6, screens 1, 6 and 7):

1. **Every Inventory card shows who can see it.** After the card code, a small tag: "Private"
   with a lock (grey), "Public" with a globe (teal), or, for a card set to Public that nobody can
   see yet, the amber short label of its status ("Public · not visible", or "Public · ended" for a
   temporary publication of the paused web that ended). The row's spoken name says it too ("Ash
   Blossom & Joyous Spring, LAVD-EN008, Public, 85% TCG, 1 copy"). The bulk actions and the filter
   "Who can see it" stay as they are.
2. **The asking price is typed in "$" or in "% TCG".** A switch "$" | "% TCG" beside a number box;
   "$" takes more than 0, at most 2 decimals and at most 99999.99 (a comma is a decimal point),
   "% TCG" a whole number from 1 to 200; empty means no price. Switching clears the number. A new
   card starts in the mode used last on the phone, the mode of the last price saved ("$" the
   first time). A card saves one text, "$12.50" or "85% TCG", shown everywhere as it is. Edit card
   reads a saved price back into its mode, and any save writes it that one way ("85 % tcg" becomes
   "85% TCG"); any other old text ("Trade only") shows as "Was: {text}" and is kept until a price
   is typed or the box is emptied. Copies moves to its own row above the price. Deck
   cores keep their free text. No migration and no API change.

Screens 1 and 7 as built, on the iPhone simulator (dark, default text size, fictional data):
[Inventory with the tags](../screens/2026-10-16-screen-01-inventory-tags.jpg) and
[Edit card with the price switch](../screens/2026-10-16-screen-07-edit-card-price.jpg).

---

## Changed by the owner on 2026-10-19

The owner's prompt of 2026-10-19/20 ([`2026-10-20-finish-the-phone-ui.md`](2026-10-20-finish-the-phone-ui.md),
saved word for word) asks, among other stages, for **stage G, one game at a time**, between R6 and
R7: _"Next to Americas(north), put a dropdown section button to select the game. Same in search
section, on the right of search text at the top. You can remove the "All games" "yugioh" "pokemon"
below the search bar. For the binder, it needs to section the game for the binder. So that, this
idea make the user only see one game at the time, in home page and in search."_ The prompt above is
kept as it was; for stage G these points replace what it says about them (mockup version 50,
screens 34 and 35, changes to 10 to 18):

1. **Five games**: Yu-Gi-Oh!, Pokémon, Magic: The Gathering, One Piece (new, English cards only)
   and Riftbound. A game whose catalogue holds no card yet is shown dimmed with "Cards coming
   soon": it cannot be browsed or hold a binder, but it can be on a profile.
2. **The browsed game**, like the browsed region: remembered per account on the phone, starting on
   the first game of the collector's profile that has cards, else Yu-Gi-Oh!. It scopes Home (stage
   R7) and every Search segment (the map's counts, the card search, the binders and deck cores, the
   wishlist); Inventory › Cards, chats and the bell keep every game.
3. **The game pill** right of Search's title (and, with R7, right of the region pill on Home)
   opens "Choose a game" (screen 34). The region pill opens "Choose a region" (screen 35), and
   its border turns orange while another region than the collector's is browsed.
4. **Search typing** (screen 12) has no game chips any more: the field says "{game} card name or
   code", a result is the card's name with the typed part in orange and nothing else, and no match
   says "No {game} card matches “{text}”". Section 8's game chips are gone.
5. **Binders have a game**: every binder holds the cards of one game, chosen when it is made
   (New binder gains a Game picker until stage R14 rebuilds it) and fixed once it holds a card;
   Inventory › Binders (screen 17) is grouped by game; Edit binder (screen 18) shows the Name and
   the Game side by side, the game locked; binder pickers list the binders of the card's game.
   Existing binders took the game most of their cards belong to; the cards of another game left
   the binder and stay in the inventory.

Built as stage G (`IMPLEMENTATION_STATUS.md`, "Phone redesign G: one game at a time
(2026-10-20)"; API contract [`docs/api/contracts/g-one-game.md`](../../api/contracts/g-one-game.md)).

---

## Changed by the owner on 2026-10-19: Home

The owner's prompt of 2026-10-19 ([`2026-10-19-home-full-design.md`](2026-10-19-home-full-design.md),
saved word for word; mockup version 50, screens 10, 10b and 10c) designs the whole Home page for
stage R7. The prompt above is kept as it was; for Home these points replace its section 5 and add
to the "Home feed" part of its section 12:

1. **The top row** holds the region pill and stage G's game pill on the left, the bell on the
   right; everything below follows the browsed region and game. "Search cards or collectors" opens
   Search with the keyboard up.
2. **Get started** (screen 10c), until done or hidden: "Choose your province" (done with a
   province and "Show me on the map" on; "Turn on" when hidden from the map), "List your first
   card", "Add a card you want", a 3-part progress bar; hidden for good per account on the phone.
3. **Chips** All, New cards, Wanted, Deck cores, with their kind's dot, pinned on scroll; none in
   a region with nothing in the window. The choice goes back to All when the app restarts.
4. **Sections** "Today", "Earlier this week" (1 to 6 days ago), "Earlier this month" (7 to 30),
   in the phone's time zone ("Today in your region" becomes "Today"); times "5 min", "1 h", the
   weekday, then the date.
5. **The posts** share one header ("{handle} {verb}", then "{time} · {province}"; the verb grey,
   teal or purple): new cards as a 4-column grid with "+{n}" from 5 cards, or one card as a row
   with a round Message button that pins it; a wish with its terms and "I have it"; a deck core
   with a 132-tall band, its tag, "{n} photos", its price and the first line of its note. This
   replaces the "Wanted · {handle} · {province}" and "Deck core · {handle} · {province}" lines.
6. **The end** says "You're all caught up" and what was everything (per chip), with "Explore the
   map"; the empty state is "Nothing new in {region} yet" ("in {game}" when only the game is
   quiet) with "Be the first: ...", and "Add cards" when Get started is not shown.
7. **`GET /api/v1/feed`** takes `game=` (required), keeps a 30-day window as a server setting
   (`orenji.feed.window-days`), groups a collector's cards per hour, leaves the cards of a public
   deck core to the core's post, and carries the fields of section 5 of the prompt.

Built as stage R7 (`IMPLEMENTATION_STATUS.md`, "Phone redesign R7: Home (2026-10-21)"; API contract
[`docs/api/contracts/r7-home-feed.md`](../../api/contracts/r7-home-feed.md)).

---

## Changed by the owner on 2026-10-19: Notifications and the bell

The owner's prompt of 2026-10-19/20 ([`2026-10-20-finish-the-phone-ui.md`](2026-10-20-finish-the-phone-ui.md),
section R9, saved word for word; mockup version 50, screen 31) designs the notifications. The
prompt above is kept as it was; for the bell and its screen these points replace what it said of
the notification centre:

1. **The bell** sits on the top bars of Home, Search, Inventory, Messages and Profile: an orange dot
   while anything is unread, spoken "Notifications, {n} new" (or "Notifications"). Chats are left
   out (Messages has its own badge).
2. **Notifications** has back, the title and a gear (Settings › Notifications); "New" with "Mark
   all as read", "Earlier" with the rest, newest first, by cursor pages. A row: an icon tile in its
   kind's colours, "{bold subject} {rest}", one muted line, the time ("5 min", "1 h", "Yesterday",
   "Sat", "Sep 30"), the card picture, an orange dot while unread.
3. **Targets**: a wishlist alert opens Who has this card on its printing, a sale the chat, a rating
   your ratings on your profile; reports, system notices and the paused web's old offers, trades,
   payments and disputes open nothing (grey). Freshness reminders are answered in place ("Still have
   them", "Review the binder", then "Confirmed. They stay in search."). A push notification opens
   the same target as its row.
4. **The API** gains `excludeTypes` on `GET /notifications` and its unread count (the phone sends
   `MESSAGE`); without it both behave as before.

Built as stage R9 (`IMPLEMENTATION_STATUS.md`, "Phone redesign R9: Notifications (31) and the bell
(2026-10-21)"; API contract [`docs/api/contracts/r9-notifications.md`](../../api/contracts/r9-notifications.md)).
A rating's comment and the reported collector's handle stay out of the rows (Phase 7 rules), unlike
the mockup's example rows.

## Changed by the owner on 2026-10-19: Card data for Magic and Pokémon

The owner's prompt of 2026-10-19/20 ([`2026-10-20-finish-the-phone-ui.md`](2026-10-20-finish-the-phone-ui.md),
section R10, saved word for word) gives two more games real cards. The prompt above is kept as it
was; for the catalogue these points replace what it said of the card data:

1. **Magic** comes from Scryfall's daily bulk file "Unique Artwork": English paper cards, one image
   per artwork, printings by set code and collector number. **Pokémon** comes from TCGdex's card
   database (MIT licence), English only, one image per printing. The owner runs both imports (agents
   never do): `npm run catalog:import -- --game mtg --provider scryfall --images all`,
   `npm run catalog:import -- --game pokemon --provider tcgdex --images all`, then
   `npm run card-images:status`.
2. **Once a game has cards** it is no longer dimmed in "Choose a game" (screen 34): Search typing
   finds its cards and Who has this card shows their pictures, always through
   `/api/v1/public/card-images` (never hotlink provider images, for every provider).
3. **Credits**: under a Magic card's pictures "Card data and images courtesy of Scryfall" with
   Wizards of the Coast's Fan Content Policy notice; under a Pokémon card's "Card data courtesy of
   TCGdex (MIT licence)" with the Pokémon copyright notice (both drafts for the lawyer review);
   Settings › Appearance (screen 53) lists the card data of every game that has cards ("Yu-Gi-Oh!
   card data from YGOPRODeck. Pokémon card data from TCGdex. Magic card data and images from
   Scryfall. Not affiliated with or endorsed by the game publishers.").
4. **One Piece and Riftbound** stay "Cards coming soon": One Piece waits for Bandai's written
   permission, Riftbound for Riot's production key.

Built as stage R10 (`IMPLEMENTATION_STATUS.md`, "Phone redesign R10: Card data for Magic and
Pokémon"; [ADR 0021](../../architecture/adr/0021-five-games-and-their-card-sources.md); API contract
[`docs/api/contracts/r10-card-sources.md`](../../api/contracts/r10-card-sources.md)). The prompt calls
the record "ADR 0020"; that number was the camera card scan's, so it is ADR 0021.

## Changed by the owner on 2026-10-19: Messages › Community

The owner's prompt of 2026-10-19/20 ([`2026-10-20-finish-the-phone-ui.md`](2026-10-20-finish-the-phone-ui.md),
section R11, saved word for word; mockup version 50, screens 32 and 33, and screen 22's tabs) asks for
"a section for community by region, game", "just a simple one". The prompt above is kept as it was;
for the community these points replace what it said (section 10 kept today's "Inbox | Community"
switch over the channels):

1. **Messages** has two tabs, **Chats** and **Community** (Community while the `publicChat` flag is
   on; a migration turns it on, and it stays the kill switch). Chats has an orange dot while a chat
   is unread; the tab bar's badge counts chats only.
2. **One room per platform region and game**, 15 in all (slug `{region}-{game}`, the game's name,
   "{game} collectors in {region}: trades and sales by mail."); every other channel is archived,
   nothing deleted.
3. **The room list** (screen 32): the region pill, the browsed region's five rooms with the browsed
   game's room first and the others in the games' order; each row the game's tile and name, the
   last post ("{handle}: {text}") and its time, bold with an orange dot while there are posts newer
   than the last visit on this phone; "No posts yet. Say hi!"; at the end "Every collector in
   {region} can read these rooms. Keep deals and addresses in private chats."
4. **A room** (screen 33): back, the tile, the name and "{region} · public room", Room rules, the
   banner "Every collector can read this room. Keep deals and addresses in private chats.", posts
   like a chat (newest at the bottom, day separators; avatar, handle, "{province} · {time}" and never
   a city, the text, up to 4 photos, a shared card or binder or deck core); "⋯" with "Message
   {handle}", "Report this post", "Block {handle}", or "Delete" on one's own; no reply threads on the
   phone. The message box: "+" (Send a photo, Share a card, Share a binder or deck core), "Write to
   the room", the send button orange with text.
5. **Photos**: up to 4 per post, 3 MB each, photos only, uploaded as `COMMUNITY` with EXIF and GPS
   stripped. **Errors**: "You can post up to 10 times an hour in each room. Try again later.", "You
   already posted this.", a network error keeps the text with "Try again". Blocked pairs, removed
   posts and suspended accounts stay hidden; posts never notify.

Built as stage R11 (`IMPLEMENTATION_STATUS.md`, "Phone redesign R11: Messages > Community (32, 33):
one simple room per game"; API contract
[`docs/api/contracts/r11-community-rooms.md`](../../api/contracts/r11-community-rooms.md); V134). A
post's place shows only for authors who are discoverable (the profile's own rule), and the paused
web's suites keep the archived channels in their own test database until the web resumes.
