# OrenjiTrade Web: final desktop layout spec (v2, 2026-10-20: §15 admin console redesigned)

**Status.** Design only. `apps/web-angular` stays paused (CLAUDE.md rule 9) until the owner orders otherwise. Nothing here changes code or tokens yet.

**Basis.**
- Built on Proposal 2, "Collector Workspace", which won 2 of 3 judgments and was the only proposal with no rule violation.
- It takes Proposal 3's calm visual discipline and pill scope, and Proposal 1's search and holder-list details.
- It fixes every point the judges flagged (§20).
- All API endpoints named were checked on origin/main 108655e8, except where §18 says "additive" or "phone stage".

**Direction in one line.** On the phone you browse and chat. On the web you run your stock and hunt fast. The web has the same five areas, the same words, the same dark palette and the same rules, with the room a desk gives:
- a dense but calm Inventory;
- Messages beside the deal;
- the map beside the list.

---

## 1. Principles

1. **Same map of the product.** Home, Search, Inventory, Messages, Profile, in the phone's order, with the phone's icons, labels and copy.
2. **Every list is a workspace.** Selection, bulk actions, inline edits and keyboard paths wherever a collector handles more than about 10 things.
3. **Never leave the list to edit one thing.** Editing and adding happen in a right drawer while the list stays in view. Dialogs are only for confirmations and short forms.
4. **Calm, not a spreadsheet.**
   - At most **one orange primary button per view**.
   - No Material elevation or ripples.
   - Rows 72 px with real card art.
   - Section gaps 40, card padding 20.
5. **Pointer path and keyboard path for everything.** Drag is never the only way (WCAG 2.2 SC 2.5.7). Single-key shortcuts can be turned off (SC 2.1.4).
6. **The phone's rules, unchanged:**
   - places only;
   - no counts in search results;
   - one game at a time on Home and Search;
   - deals in the chat, shipped by mail, paid by e-Transfer outside the app;
   - no offers, payments or meetups;
   - free for all;
   - guests never see who a collector is.

---

## 2. Tokens and visual system

### 2.1 Source of truth
- Every colour, size and radius comes from `packages/design-tokens` as CSS variables (`--color-*` and so on). The hex values below are the token values, for reference only.
- Dark first. Light ready.

| Role | Dark token (value) | Light token (value) |
|---|---|---|
| Page canvas | `background` #141210 | #FFFBF7 |
| Panes, cards, popover fill | `surface` #1E1B18 | #FFFFFF |
| Hover row, selected nav row | `surfaceVariant` #292522 | #F5EFE8 |
| Toasts, bulk dock, menus | `surfaceElevated` #2A2623 | #FFFFFF |
| Dividers | `border` #292524 | #E7E5E4 |
| Pill and outline-button borders | `borderStrong` #44403C | #D6D3D1 |
| Ink | `ink` #F5F5F4 | #1C1917 |
| Muted | `textMuted` #A8A29E | #57534E |
| Primary | `primary` #FF8F3D, `onPrimary` #2A1200 | #F4761A (see §2.6) |
| Accent (links, focus) | `accent` #2DD4BF, `focusRing` #2DD4BF | #0F766E |
| Danger text | `danger` #F87171 | #DC2626 |
| Warning (amber) | `warning` #FBBF24 | #D97706 |
| Presence | `online.online` #4ADE80 (the token wins over the boards' #22C55E) | #22C55E |
| Freshness dots | `status.aging`, `status.stale` | same family |
| Deck core | `deckCore.tagBackground` #2E2547, `tagText` #C4B5FD, `switch` #8B5CF6, `border` #4C3D74 | #EDE9FE / #5B21B6 / #7C3AED |
| Chat | `chat.otherBubble` #2A2522, `saleSurface` #10211F, `saleBorder` #1F4D47, `saleText` #CCFBF1, `soldTag*` | light `chat.*` |
| Scrim | `overlay` rgba(0,0,0,0.6) | rgba(28,25,23,0.48) |

**Token work, all additive. It is done when the web resumes and is shared with the phone.**
- Remove `"$platforms":["mobile"]` from `deckCore` and `chat`, the day the web ships deck cores and the deal chat.
- **Add colours:**
  - `textSecondary` #D6D3D1 and `textFaint` #78716C (disabled only; it is 3.6:1 on `surface`);
  - `borderInput` #2E2A26;
  - `primaryHover` #FFB37A;
  - `primaryTint` (orange at 14%) and `primaryTintSubtle` (8%);
  - `accentTint` (teal at 14%);
  - `dangerFill` #DC2626 for destructive buttons in both themes;
  - `photoBackdrop` #0D0C0B;
  - `map.step0–4`. Dark: #2C2724, #5C3418, #8F4A1B, #C9661F, #FF8F3D. Light: the web's existing 5 light steps.
  - `game.<id>.fg/bg`, the monograms: Y #FDBA74 on #4A2A0A, P #FDE68A on #3F3A12, M #BFDBFE on #1E3A5F, O #FCA5A5 on #4A1D1D, R #86EFAC on #1F3B2A. These replace the hard-coded game colours in `_app-extras.scss`.
  - `notificationKind.*`: sale #1E3A5F / #93C5FD, rating #3A2E0F / #FBBF24, reminder #3A2A12 / #FCD34D.
- **Add sizes:**
  - `fontSize` adds 11, 13, 15, 17 and 28 (the phone's sizes);
  - `radius` adds 12 (inputs, segmented controls), 14 (rows, toasts) and 22 (dialogs).
- Existing spacing (4–64), motion (120/200/320 ms, `cubic-bezier(0.2,0,0,1)`) and focus (2 px, offset 2) are used as they are.

### 2.2 Type
| Use | Style |
|---|---|
| Reading-page H1 (Home, card, binder, deck core, profile, settings, auth) | Sora 700, 30/36, −0.5 |
| Workspace H1 (Inventory, Messages, Search pane) | Sora 700, 28/36, −0.4 (the phone's tab H1) |
| Pane, drawer and dialog titles | Sora 600, 20/28 |
| Section titles | Sora 600, 17/24 |
| Body and rows | Inter 15/24 (names 15/600) |
| Secondary | Inter 14/20 |
| Meta | Inter 13/18 and 12/16 |
| Section and table labels | Inter 600, 12/16, uppercase, +0.6, `textMuted` |
| Tags and rail labels | Inter 600/500, 11/14 |
| Codes, tracking numbers, file lines | JetBrains Mono 500, 13 (12 in tight rows) |

Reading width is at most 68ch.

### 2.3 Space, shape, surfaces
**Gutters and spacing**
- Workspace panes have 24 px padding. Reading pages have 32 px side gutters.
- Section gap 40. Card padding 20. Row gap 12–16.

**Radii**
| Element | Radius |
|---|---|
| Cards and posts | 16 |
| Rows inside cards | 14 |
| Inputs and segmented controls | 12 |
| Pills and buttons | 999 (pill) |
| Dialogs | 22 |
| Card art | 6 (5 under 48 px) |
| Toasts | 14 |

**Surfaces**
- Cards are `surface` with a 1 px `border`.
- Popovers and menus are `surfaceElevated` with a 1 px `borderStrong` and the `menu` shadow.
- Nothing uses Material elevation.

**Top bar**
- `background` at 85% (`color-mix`) with a 16 px backdrop blur.
- The 1 px `border` bottom line is always on for workspace pages, and appears after scroll on reading pages.

### 2.4 Controls (the phone's, sized for a pointer)
- **Buttons.**
  - Primary: orange, 40 tall (44 in page headers, 52 in dialogs and auth), with `primaryHover`.
  - Outline: `borderStrong`, 36–44 tall.
  - Tonal: `primaryTint`, 36 tall, for row actions ("Message").
  - "I have it": orange outline.
  - Text actions in teal ("See all", "Select", "Mark all as read").
  - Destructive: red text links; `dangerFill` only inside confirmation dialogs.
- **Segmented control** ("Private | Public", "$ | % TCG", "Table | Grid", "All | Unread"):
  - 36 tall, a 4 px padded `surface` track;
  - the selected segment is `ink` fill with dark text;
  - `role=radiogroup`.
- **Underline tabs.** 44 tall, with a 2 px orange underline on the active tab (Inventory, Search, Messages).
- **Chips.** 32–36 tall, outlined with `borderInput`. Selected is an `ink` fill with `aria-pressed`. Kind chips carry 8 px dots: orange cards, teal wanted, `#C4B5FD` deck cores.
- **Tags.** 22 tall, radius 6, 11/600:
  - Public: teal, with a globe;
  - Private: grey, with a lock;
  - "Public · not visible": amber;
  - Deck core: `deckCore`;
  - Sold: `chat.soldTag*`.
- **Small controls.**
  - Switch 40×24, orange when on; the deck-core switch is `deckCore.switch`.
  - Radio 20, orange dot. Checkbox 18, orange fill.
- **Pills.** Region and game pills are 36 tall, `surface` with a `borderStrong` border. The region pill's border turns orange while browsing another region.
- **Focus.** A 2 px `focusRing` with a 2 px offset on every interactive element.
- **Icons.** The phone's Lucide-like stroke set, 24 viewBox, stroke 1.8–2.2, round caps. Every icon-only button has an `aria-label` and a tooltip that names its shortcut.

### 2.5 Card art (ADR 0015)
- The only source is `/api/v1/public/card-images/{id}`: one 320 px JPEG, or the placeholder.
- **Card art is never wider than 160 CSS px anywhere**, the limit that stays sharp at 2×:
  - the hero is 160×233;
  - hover previews are 160×233;
  - grid tiles cap their art at 160.
- There is no card-art lightbox and no upscaling.
- Frames are 59:86, with a skeleton while loading and the placeholder on failure.
- User photos (deck cores, card photos, community) are not card art. They follow their own upload limits and may be shown larger.

### 2.6 Light theme rules (AA)
- **Links and teal text** use `accent` #0F766E (5.3:1 on #FFFBF7).
- **Orange** is a fill or large text only. Light `onPrimary` must change from #FFFFFF, which is 2.8:1 on #F4761A and fails, to `ink` #1C1917, which is 6.2:1. This is a token change, owner decision 21.
- **The active rail item** in light uses a `primaryContainer` (#FFE1CB) pill with ink icon and label, because orange 11 px text fails.
- **Dark checks.** All dark pairs used for text pass: `onPrimary` on `primary` 7.8:1; `textMuted` on `surface` 6.8:1.

### 2.7 Angular Material
- Material stays (no ADR needed). Its components are restyled through `mat.theme()` system variables mapped to the tokens and the per-component override mixins:
  - ripples off globally (`MAT_RIPPLE_GLOBAL_OPTIONS`);
  - elevation shadows off.
- The shell (top bar, rail, bottom tab bar) is plain standalone components that **replace** `mat-toolbar`, today's top bar, the map page's `mat-sidenav`, `app-bottom-nav` and `card-search-box`. They do not sit beside them.
- CDK overlay, a11y (FocusTrap, LiveAnnouncer, ActiveDescendantKeyManager), drag-drop and scrolling cover the behaviour. There is no new dependency.

---

## 3. Breakpoints (only the token breakpoints)

| | xl ≥1920 | lg 1280–1919 (board 1440) | md 960–1279 (board 1024) | sm 600–959 / xs <600 (boards 768, 390) |
|---|---|---|---|---|
| **Shell** | Top bar 64 and rail 72 | Top bar 64 and rail 72 | Top bar 64 and rail 72. Pills compact: globe or monogram plus a chevron, 56 wide, full name in the tooltip and popover. Search field 320 | **The phone's design.** Per-tab top bar (H1, pills, bell) and a bottom tab bar (64 plus the safe area) with Home, Search, Inventory, Messages, Profile |
| **Search** | List 400, detail 520, map (three panes) | List 400 and map. Drill-in widens the list to 520 | List 360 and map. Opening a binder goes to its full page | Full-width map with the phone's state card and List view. sm centres content at 640 |
| **Inventory** | Binder pane 256, table, drawer 440 (push) | Binder pane 256, table, drawer 440 (push) | No binder pane (a "Binder: All cards ▾" dropdown), fewer columns, drawer overlays with a scrim | Phone rows, 72 tall. Bulk dock above the tab bar. No drag, no quick-add rows |
| **Messages** | Inbox 340, chat, deal panel 320 | Inbox 340, chat, deal panel 320 | Inbox 300 and chat; the deal panel is a 360 drawer from "Deal" | One pane per route |
| **Home** | Feed 680 and rail 320 | Feed 680 and rail 320 | Feed 680 centred. Guest card or Get started on top; map card hidden | The phone's Home |
| **Overlays** | Drawers push workspace content | Drawers push workspace content | Drawers overlay | Popovers become bottom sheets, drawers full-screen sheets, the chat drawer a route |

- There is no horizontal page scroll down to 360 px.
- Reading pages: container max 1200 (Home group 1032, profile and deck core 1120, settings 1040), centred in the content area.

---

## 4. The shell

### 4.1 Grid at 1440×900
- **Top bar:** 64 tall, full width, sticky.
- **Rail:** 72 wide, from y 64 to the bottom, `background`, with a 1 px right `border`.
- **Content area:** 1368×836. Workspace pages fill it edge to edge; reading pages centre in it.
- **Skip links** come first: "Skip to content", plus "Skip the map" on Search.
- **Session banner.** When the account fails to load: an amber strip 40 tall under the bar, "We could not load your account." with "Try again". Focus returns to it after a retry.

### 4.2 Top bar, left cluster ("where you are")
1. **Wordmark.** "Orenji" in `primary` and "Trade" in `ink`, Sora 700 20, 24 px from the left. It links to Home.
2. **Region pill**, 32 px after the wordmark: teal globe, "Americas (North)", chevron. It opens the region popover (§4.5).
3. **Game pill**, 8 px after: a 22 px monogram tile, "Yu-Gi-Oh!", chevron. It opens the game popover.

**Pill scope (the phone's rule; it fixes Proposal 2's flagged confusion):**

| Page | Region pill | Game pill |
|---|---|---|
| Home, Search | ✓ | ✓ |
| Card, set, binder, deck core pages | ✓ | — (the page's own game is shown in its header) |
| Inventory, Messages, Profile, Settings, Notifications | — | — |

- The cluster is left-aligned, so nothing moves when a slot is empty.
- Messages › Community carries its own region pill in the inbox column, as on the phone.
- Opening a card, binder or deck core of another game makes that game the browsed game, so Back to Search shows it.

### 4.3 Top bar, right cluster ("what you do")
Right to left:
- **Avatar** 32 (initials on a tint), 24 from the edge. It opens the account menu.
- **Bell**, 12 px before the avatar: 40 round, `surface`, an 8 px orange dot when unread, labelled "Notifications, 2 new".
- **Global search field**, 16 px before the bell:
  - 400×40 at lg, 320 at md;
  - radius 999, `surface`, 1 px `borderInput`;
  - a magnifier, the placeholder "Search Yu-Gi-Oh! cards or collectors" (it names the browsed game), and a "/" key chip;
  - **hidden on `/search`**, whose pane has its own field.

**Guests:** the bell and avatar are replaced by a "Sign in" outline pill (36). "Create account" lives in the guest card, the guest pages and the sign-in dialog, which keeps the bar calm.

### 4.4 Global search dropdown
**Panel.** 560 wide, right-aligned to the field, max 520 tall, `surfaceElevated`, radius 16. ARIA combobox and listbox with `aria-activedescendant`.

**Empty field.**
- "Recent searches" with "Clear", up to 8 rows, each with a remove button.
- Footnote: "Only you see your searches. They're kept in this browser. You can turn this off in Settings › Privacy."
- Nothing is stored when "Remember my searches" is off.
- Storage is localStorage wrapped in try/catch. Searches are never sent to the server or to analytics.

**Typing** (150 ms debounce, from 2 characters; `GET /search/suggest?q&game&region`, and signed in only, `GET /search/collectors`):
- **Yu-Gi-Oh! cards:** up to 8 rows, 56 tall, with 40×58 art and the name, the match in orange 600. When the text is a printing code, a mono chip "LAVD-EN008" sits on the right.
- **Collectors:** at most 3 rows (avatar 28, handle, province). Never shown to guests.
- **Last row:** "Search binders and deck cores for 'yubel'". It opens Search › Binders with `q`.
- **Hint bar** (32): "↑↓ to move · Enter to open · Esc to close".
- **No counts of any kind** (no printing or holder numbers) and no game label.
- **No match:** "No Yu-Gi-Oh! card matches '{q}'" and "Try fewer letters, or the code printed on the card, like LAVD-EN008."

**Opening a result.**
- Enter opens `/cards/:id`.
- A code that matches exactly one printing opens with `&printing=` preselected. A code shared by several printings opens on "Any printing". This fixes the recorded first-printing defect.
- Enter on free text opens `/search?tab=cards&q=`.
- Cmd/Ctrl+Enter or a middle-click opens a new tab.

### 4.5 Region and game popovers (360, anchored, radius 16)
**Region:**
- Title "Choose a region" and "Home, Search and the map show one region at a time. Cards ship within a region."
- Radio rows, 60 tall: "Americas (North)" with "Your region · Canada, United States, Mexico"; "Americas (South)" with "Brazil, Argentina, Chile and more"; "Europe" with "France, Germany, Spain and more".
- Footnote: "Your own region comes from Settings › Location. Browsing another one changes nothing on your profile."
- **Browsing away:**
  - the pill border is orange;
  - the popover shows "Not your region. Back to Americas (North)";
  - the same line shows at the top of the Home feed and the Search list pane.

**Game:**
- Title "Choose a game" and "Home and Search show one game at a time."
- Rows 56 tall: a 38 px tile, the name, "17 of your cards" or "None of your cards yet", and a radio.
- One Piece and Riftbound are at 0.5 opacity with "Cards coming soon", `aria-disabled`.
- Footnote: "Your inventory keeps every game, with binders grouped by game. Chats and the bell show every game."

**Both popovers:**
- Arrow keys move, Enter picks and closes, Esc closes, and focus returns to the pill.
- The browsed region and game live in the URL on Home, Search and the discovery pages (`?region=&game=`). The last choice is also kept in this browser (localStorage, try/catch).
- Default: signed in, the home region; signed out, the last choice, otherwise `americas-north`. There is never IP geolocation.

### 4.6 Rail (72)
- **Items:** Home, Search, Inventory, Messages, Profile. Each is 72×64, a 24 px icon over an 11/500 label, starting 8 px below the bar.
- **Active item:**
  - a 48×32 `primaryTint` pill behind a filled orange icon;
  - an orange label;
  - `aria-current="page"`.
- **Inactive items:** `textMuted`. On hover, `ink` and a `primaryTintSubtle` pill.
- **Messages badge:** an orange count of unread chats only, 18 tall, at the top right of the icon.
- **Bottom of the rail:**
  - staff only, a shield "Admin" item;
  - a 40 px "?" button that opens Keyboard shortcuts.
- **Tooltips** name the area and its shortcut ("Search · g s").
- **Guests:** the rail is unchanged. Inventory, Messages and Profile open the guest pages (§14).

### 4.7 Account menu (240, anchored to the avatar)
- Header: avatar, "Sam Tremblay", "@sam_trades".
- Items: "View my profile", "Settings", "Appearance ›" (Same as the system / Light / Dark), "Keyboard shortcuts", "Trading safely", then (staff only, after a divider) "Admin console", then a divider and "Sign out" in `danger`.
- There are no Offers, Trades or Payouts items.

### 4.8 Overlays and feedback
**Drawers**
- Right side, 440 wide, from the top bar down. `surface` with a 1 px left `border` and the `sheet` shadow. Title Sora 20, sticky footer 72.
- At lg and xl they **push** workspace content; at md they overlay with a scrim.
- They open in 320 ms (reduced motion: instantly).
- Focus is trapped (except the non-modal chat drawer), and returns to the opener on close.

**Dialogs**
- Centred, radius 22, scrim `overlay`. Widths: 440 for confirmations, 480 for Mark as sold, 520 for forms, 560 for Rate.
- The title is the accessible name. Esc closes. Destructive confirmations use `dangerFill`.

**Popovers and menus**
- "⋯" and "+" are always menus, never sheets.
- Menu rows are 40 tall, with a 20 px icon and 14 text.

**Toasts**
- Bottom-left, 24 px from the rail and the bottom edge, max 400 wide, `surfaceElevated`, radius 14.
- Contents: a green check, a title, a sub-line and one teal action ("View", "Undo").
- They stack up to 3. They stay 6 s, or 10 s with an Undo, pausing on hover or focus. `role=status`.

**Chat drawer** — see §10.6.

### 4.9 Keyboard (the "?" dialog, 520)
| Key | Action |
|---|---|
| `/` | Focus the page's own search (Inventory, Messages, Search), otherwise the global one |
| Ctrl/Cmd+K | Always the global search (on `/search`, the pane field) |
| `g` then `h` `s` `i` `m` `p` | Go to Home, Search, Inventory, Messages, Profile |
| `n` | Add cards (opens the Add drawer; outside Inventory it goes there first) |
| Shift+N | Quick add rows (Inventory) |
| ↑↓ or `j` `k`, Enter | Move in lists, open |
| Space or `x` | Select the focused row |
| Ctrl/Cmd+A | Select the loaded rows (table focused) |
| Esc | Close the top overlay, or clear the selection |
| Alt+↑ / Alt+↓ | In the Edit drawer: save, then open the previous or next card |
| Ctrl/Cmd+Enter | Save the drawer, or send |
| Enter / Shift+Enter | In the composer: send / new line |
| Ctrl/Cmd+Z | Undo the last undoable action **only when focus is not in an editable field**, within the server's 10 minutes. It never overrides text undo |
| `?` | This dialog |

- Single-key shortcuts never fire inside a field.
- Single-key shortcuts can be turned off in Settings › Appearance; the dialog says so.

### 4.10 Footer
- **Split and workspace pages have no footer:** Search, Inventory, Import, Messages.
- **Reading pages** (card, set, binder, deck core, profile, notifications, settings, legal) end with a 48 tall footer, 13 muted: the wordmark, "Who in my region has this card?", "Trading safely · Legal · Card data credits · Made with Natural Earth".
- **Home** puts the same links at the bottom of its rail.

### 4.11 Routes (all lazy) and redirects
| Route | Shows |
|---|---|
| `/` `?region&game&kind=all\|cards\|wanted\|deckcores` | Home |
| `/search?region&game&tab=cards\|binders\|wishlist&q&state=CA-QC&kind=binders\|deckcores&open=<binderId>&wish=<id>` | Search |
| `/cards/:id?printing&region` | Who has this card |
| `/sets/:id` | Set page |
| `/binders/:id` | Public binder or deck core |
| `/collectors/:handle`, `/profile` | A profile; your own |
| `/inventory?tab=cards\|binders&binder&game&visibility&sort&view=table\|grid&item&imported` | Inventory |
| `/inventory/import` | Import |
| `/messages`, `/messages/:id`, `/messages?tab=community`, `/messages/community/:room` | Messages |
| `/notifications?unread=1` | Notifications |
| `/settings/:section` | Settings |
| `/onboarding`, `/auth/*`, `/legal/:key`, `/admin/*` | Welcome, sign-in and account states, legal, admin |

Redirects:
- `/map?region&subdivision` → `/search?region&state`.
- `/cards?q=` → `/search?tab=cards&q=`.
- `/wishlist[/:id]` → `/search?tab=wishlist`.
- `/community[/:slug]` → `/messages?tab=community`.
- `/offers*`, `/trades*` → `/messages`, with the toast "Offers are no longer available. Deals happen in the chat."
- `/checkout*`, `/disputes*` → a notice page: "Payments and disputes aren't part of OrenjiTrade. Deals happen in the chat, and the buyer pays by e-Transfer outside the app." with [Go to Messages].
- `/settings/offers|payouts` → `/settings`.
- `/settings/trading-area` → `/settings/location`.

---

## 5. Home (`/`)

### 5.1 Layout at 1440
- A centred group of 1032: **feed 680**, a 32 gap, and a **rail 320**.
- **Header** (32 below the bar): H1 "What's new" and the muted line "Yu-Gi-Oh! · Americas (North) · last 30 days".
- **Sticky toolbar** (56, sticks at top 64, with a 12 px fade of `background`):
  - chips `role=group "Show"`: "All", "New cards" (orange dot), "Wanted" (teal dot), "Deck cores" (`#C4B5FD` dot);
  - right-aligned: "Updated 5 min ago" (13 muted) and a 36 px refresh icon button.
  - While the tab is visible the page checks every 5 minutes. When newer posts exist, a centred "New posts · Show" pill (36, `primaryTint`, **no number**) appears under the toolbar. Posts never slide in on their own.
- **Sections:** "TODAY", "EARLIER THIS WEEK", "EARLIER THIS MONTH" (label style, 40 above).

### 5.2 Posts
Each post is a `surface` card, radius 16, padding 20, 16 apart, with a `borderStrong` border on hover.

**Header** (the avatar and handle open the profile):
- a 36 px avatar;
- "**maya_k** listed 12 cards", with the verb `textMuted` for cards, teal for wishes, `#C4B5FD` for deck cores;
- "5 min · Quebec" (13 muted).

**Bodies:**
| Kind | Body |
|---|---|
| New cards, 2 or more | A 6-column grid of 100×147 tiles, 8 apart, with the price under each (13/600). With 7 or more cards, the 6th tile reads "+N" and opens the profile. A tile opens Who has this card |
| New cards, exactly 1 | 64×93 art; the name (16/600); "RA01-EN075 · Platinum Secret Rare" (code in mono); the price; a tonal "Message" pill (36) labelled "Message maya_k about {card}" |
| Wanted | 64×93 art, the name, the terms ("Any printing · NM only · 85% TCG"), and "I have it" (orange outline, 36) |
| Deck core | A 640×200 photo band (radius 12) with the "Deck core" tag and "4 photos" with a camera icon; then the name (17/600), the price ("$95" or "Trade only") and a one-line note. It opens the deck core page |

**Actions.**
- "Message" opens the **chat drawer** with that item as the subject.
- "I have it" opens the chat drawer to the wisher with the draft "Hi! I have {card}." When your inventory holds that card, your copy is the subject.

### 5.3 Rail (320, sticky at top 144)
1. **Guest card** (guests) or **Get started** (day one, until done or hidden):
   - "Do these once to sell and find cards in your region.";
   - a 3-part bar with "1 of 3" and a close button "Hide these steps";
   - steps: "Choose your province" (done: "Quebec, Canada"); "List your first card" / "Add a card and set it to Public" [Add cards] (the view's one orange); "Add a card you want" / "We'll tell you when someone lists it" [Add a wish].
2. **Map card:**
   - a static, pre-shaded SVG choropleth (280×168) of the browsed region and game, drawn from the bundled boundaries and the binder counts, with no Leaflet;
   - your province with a teal dashed outline;
   - "Quebec · your province" and "7 binders · 5 deck cores" (map counts are allowed);
   - [Explore the map] (outline), which opens Search;
   - caption "Public Yu-Gi-Oh! binders in Americas (North)".
3. **Rail footer** (12 muted): "Trading safely · Legal · Card data credits · Made with Natural Earth".

**There is no wishlist module and no "Your desk" module on Home** (owner, 2026-10-19; see the decisions). Wishlist alerts go to the bell.

### 5.4 States and behaviour
- **Data:** `GET /feed?region&game&kind`, cursor paging over 30 days, never your own posts, blocks excluded in SQL.
- **Skeletons:** 3 post skeletons.
- **Errors:** "Couldn't load what's new." [Try again]; at the end, "Couldn't load more" [Try again].
- **End of the feed:** a teal check, "You're all caught up", "That's everything new for Yu-Gi-Oh! in Americas (North) from the last 30 days." and [Explore the map].
- **Day one:** a dashed box, "Nothing new in Americas (North) yet" / "Be the first: the cards you make public show up here for collectors in your region."
- **Empty game:** "Nothing new in {game} yet" with "When collectors in Americas (North) list {game} cards, wishes or deck cores, they show up here.", [Add your {game} cards] and [Switch game].
- **Guests:** posts read "A collector" with a plain grey avatar, and the province stays. Message and "I have it" open the sign-in dialog.

### 5.5 From the phone, and why
- The pills and the search move to the top bar.
- The grid goes from 4 to 6 tiles, because there is width.
- Get started and the map move to a rail, so the feed stays a feed.
- A refresh button and an uncounted pill replace pull to refresh, because there is no touch.
- The chat drawer means you message without losing your place.

---

## 6. Search (`/search`)

### 6.1 Layout at 1440
- Full height under the bar (`calc(100vh - 64px)`).
- **List pane 400**: `background`, 1 px right `border`, scrolls on its own.
- **Map pane 968.**
- xl: list 400 | detail 520 | map. md: list 360 | map.

**List pane head** (padding 24):
- H1 "Search" (28);
- underline tabs **Cards | Binders | Wishlist 6** (your wish count is allowed);
- the "Not your region. Back to Americas (North)" line when browsing away.

### 6.2 Cards tab (default)
- **Field:** 44 tall, focused on arrival, "Card name or code, like LOB-EN001".
- **Empty field:**
  - Recent searches, as in §4.4;
  - a quiet line: "Pick a state on the map to see its binders."
- **Typing:** the same results as the global dropdown, at full pane height: picture and name only, Collectors (members only, 3 at most), the last row "Search binders and deck cores for '{q}'", and the same no-match copy.
- Enter or a click opens the card page.

### 6.3 Binders tab
- **Field:** "Deck, binder or collector, like Yubel". It matches binder names, handles and deck-core key cards.
- **State chip** "Quebec ×" (spoken "Showing Quebec. Show the whole region"), or a teal "Pick on the map".
- **Segmented control:** "Binders | Deck cores" (36).
- **With no state and an empty field**, the pane shows **"Browse by state or province"**. This is the accessible twin of the map that ADR 0017 requires beside it:
  - "Your province" is pinned first ("Quebec · your province");
  - then country groups (label style: CANADA, UNITED STATES, MEXICO);
  - rows are 44 tall with "7 binders · 5 deck cores" muted on the right (map counts are allowed);
  - states with none are muted and carry no text;
  - a first row "Whole region" lists every binder.
- **Rows** (72 tall):
  - a deck core: a 56 px photo (radius 10), the name (15/600), "duelist.jp · Quebec" (13 muted) and the price on the right (15/600);
  - a binder: a 56 px two-card fan, the name and "maya_k · 120 cards".
- **Hovering or focusing a row** outlines its province on the map. Nothing is fetched on hover.
- **Paging:** cursor paging with [Load more].
- **Empty states:** "No public binders here yet.", "No deck cores for sale here yet.", "Nothing matches. Try a deck name, a card name or a collector."

### 6.4 Map pane
- **Leaflet** with the bundled `public/boundaries/<region>.json`, no tiles, on `background`.
- **Fit:** it opens on the declared province and its neighbours, or fits the region for guests and collectors without a location.
- **Fills:** `map.step0–4` by public binder count for the **browsed game** (stage G), with the legend None / 1 / 2–4 / 5–9 / 10+. Borders are 0.8 px `background`.
- **Hover:** a 1.5 px `ink` stroke and a tooltip (`surfaceElevated`, radius 12): "Ontario, Canada" / "4 binders · 1 deck core" (only the non-zero parts), or "No public binders here yet".
- **Selected:** a 2 px orange outline. Your province always has a 1.5 px teal dashed outline.
- **Clicking a state** switches the pane to Binders filtered to it (`&state=CA-QC`) and keeps the map. This replaces the phone's state-card step (owner decision 14).
- **Overlays:**
  - top-right, a "Show my province" pill (36; it centres the declared province, never a device), then zoom + and − (40, stacked);
  - bottom-left, the legend card "Public binders · Yu-Gi-Oh!";
  - bottom-right, "Made with Natural Earth" (11).
- **Interaction:** wheel zoom is on, because the pane never scrolls the page.
- **Keyboard:** the map is focusable; arrows pan and +/− zoom. The state list is the full keyboard and screen-reader path. "Skip the map" jumps to it.
- **Label:** "Map of public Yu-Gi-Oh! binders by state or province in Americas (North)".
- No pins, no people, no tiles. **Never shade any map by a card's holders.**

### 6.5 Opening a binder or deck core (drill-in)
**Where it opens.**
- lg: the list pane widens to 520 and the map narrows to 848. A 48 px header reads "← Back to results"; Back restores the scroll and focus.
- xl: the middle pane opens instead.
- md: the full page opens.

**Deck core:**
- a 472×354 main photo on `photoBackdrop`, with 4 thumbnails of 64;
- the tags "Deck core" and "YU-GI-OH!", the name (Sora 20), the price (Sora 20);
- a seller row: avatar 36, "duelist.jp · ★4.9", "Quebec · 2 public binders" (opens the profile);
- the note and "Key cards" chips ("Yubel ×3"), which open card pages;
- a sticky bottom bar (72): [Message duelist.jp] (orange 44, full width) and "Open full page ↗".

**Binder:**
- the name, the owner row and the province;
- "Search this binder";
- a 3-column grid (art ≤149), each tile with the price and ×n;
- "Open full page ↗".

**Binder views.**
- Opening spends one public binder view (30 a day for members, as the server counts them).
- Views are spent **only on an explicit open**, never on hover or prefetch.
- At the limit the pane shows: "You've opened 30 public binders today. Every collector has the same limits. More tomorrow at {time}."

### 6.6 Wishlist tab (signed in)
**List pane:**
- a switch card:
  - "Tell me when someone in my region lists one";
  - "Let others see what you want", with "Collectors who have these cards can message you";
- a dashed orange [Add a wish] (48);
- wish rows, 72 tall: 42×60 art, the name, the terms ("Any printing · 90% TCG", "TN19-EN013 · NM only"), and on the right **"Available"** (teal) or "None yet" (grey);
- "Select" (teal) turns on checkboxes and a bulk dock with [Remove from wishlist].

**Map pane becomes the holder pane:**
- Selecting a wish shows that card's **Who has this card** list (the §7 component), filtered to the wish's printing and grouped by province, with a header: name, terms, [Edit wish], "Open card page".
- With nothing selected: "Pick a wish to see who in Americas (North) has it."

**Add a wish dialog (520):**
- a card search, then "{n} printings in the catalog" with "Change" (your own add flow, so counts are allowed);
- "Which copy: Any printing";
- "Near Mint only";
- price chips "No price / 80% TCG / 85% TCG / 90% TCG / 100% TCG";
- a public note 0 / 280;
- [Add to wishlist].

**Edit wish:** the same dialog with "Remove from wishlist", confirmed by "You stop getting alerts for it."

**Limits:** "You have 20 wishes, the most each collector can have. Every collector has the same limits."

**Guests:** the tab shows the guest page "Get told when it's listed" with [Create account] and [Sign in].

### 6.7 From the phone, and why
- Map and list sit side by side, so a click on a state lands in its binders.
- The state list is always one tab away, for keyboards and screen readers.
- Binders open beside the map, so you never lose your place.
- Wishlist uses the free pane to show who has each wish, the fastest staple hunt.

---

## 7. Who has this card (`/cards/:id`) and set pages

### 7.1 Layout at 1440
A container of 1200: a **left column of 320** (sticky at top 88), a 48 gap, and a **right column of 832**.

### 7.2 Left column
- **Art:** a `surface` frame (radius 16, padding 20) with the art at **160×233**.
- "YU-GI-OH!" (label style), then the H1 name (Sora 30).
- "Check TCGplayer price ↗" (teal; a new tab with a plain search link; nothing fetched).
- **Wishlist toggle** (44, full width):
  - off: outline "Add to wishlist", which creates an "Any printing" wish;
  - on: teal tint "On your wishlist" with a check;
  - a second click opens Edit wish.
- **"I have this card"** (outline 44). It opens the Add drawer over the page, at the printing step, or at the details step when a printing is chosen. This is the seller hook (owner decision 16).
- The card data credit for the game (12 muted, `[to confirm]`).
- **There is no card text, type line, attributes or market price** (decision 9A, as on the phone).

### 7.3 Right column
- **Header:** H2 "Who has this card" (Sora 20) with "in Americas (North)" muted. On the right, an **"Any printing ▾"** pill (36) opens a 400 listbox:
  - a filter field "Set code or set name" and rarity chips;
  - rows "LAVD-EN008 · Legendary Arc-V Decks · 2017 · Ultra Rare";
  - **no counts**.
  - Picking one changes the art and the list.
- **"Jump to:"** a chip row of the provinces in the list (Quebec · Ontario · New York · California). It scrolls to a group and shows no numbers. It replaces Proposal 1's tinted mini map.
- **"Also in a deck core":** a `surface` card with a `deckCore.border`, up to 3 rows of 56. Each row: a 48 photo, "Yubel core · duelist.jp · Quebec · $95", a chevron. It opens the deck core.
- **Holders grouped by province** (`sort=province`):
  - group order: "QUEBEC · YOUR PROVINCE", then the rest of your country, then the region;
  - group headers are 40 tall, label style, and sticky at top 64 inside the column.
- **Rows** (72 tall, in a `surface` card with dividers, roving tabindex):
  - a 36 avatar with the online dot;
  - the handle (15/600), which opens the profile;
  - line 2: the mono code · rarity · the **public note** on one line (condition lives in the note since 2026-10-14), with the full note in a tooltip and in the accessible description;
  - on the right: the price text (15/600: "85% TCG", "$32", "Trade only"), "×2" (13 muted), and a tonal "Message" pill (36) labelled "Message duelist.jp about Ash Blossom & Joyous Spring".
  - Message opens the chat drawer with this item as the subject.
- [Load more] at the end (cursor).
- **No counts anywhere on this page.**

### 7.4 States
- **Loading:** a skeleton of 6 rows.
- **Empty:** "Nobody in Americas (North) lists this card yet." with [Add to wishlist] and "We'll tell you when someone lists it."
- **Error:** "Couldn't load who has this card." [Try again].
- **Guests:** rows read "A collector" with a plain grey avatar and no presence; the province, code, note and price stay. Message and the row open the sign-in dialog.

### 7.5 Set page (`/sets/:id`, container 1200)
- **Header:** mono "ROTA", the set name (H1), "Released Nov 1, 2024 · 101 printings", and [Who has cards of this set] (outline).
- **Grid:** `repeat(auto-fill, minmax(136px, 1fr))`, gap 20, art ≤160. Each tile shows the mono code and the rarity, and opens the card page.
- **"Add from this set"** (signed in, web-only, owner decision 17):
  - a toggle puts a − 0 + "I have" stepper on each tile;
  - a sticky footer (72): "7 cards", [Private | Public] (default Private), "Binder ▾" (this game), and [Add 7 cards] (orange);
  - one item create per tile until batch create exists;
  - then the toast "7 cards added" [View].

### 7.6 From the phone, and why
- The card stays in view while you scan holders.
- The printing picker is a popover.
- The note on each row saves an open.
- The jump chips replace scrolling.
- Same content otherwise.

---

## 8. Binder and deck core pages (`/binders/:id`)

### 8.1 Deck core (container 1120)
**Gallery (680, left):**
- the main photo at 680×510, contained on `photoBackdrop`, radius 16;
- up to 4 thumbnails of 88×66 (radius 10);
- ←/→ switch photos; a click opens a lightbox at the photo's own size (user photos, not card art); Esc closes.

**Panel (400, sticky at top 88):**
- the tags "Deck core" and "YU-GI-OH!";
- the name (Sora 30) and the price (Sora 24: "$95" or "Trade only");
- a seller card: avatar 40, "duelist.jp · ★4.9", "Quebec · 2 public binders", "View profile";
- [Message duelist.jp] (orange 52, full width);
- the note (15/24);
- "Key cards" chips ("Yubel ×3"), which open card pages;
- a "⋯" menu: Share, Report.

**Your own deck core:** [Manage in Inventory] (outline) replaces Message.

### 8.2 Binder (container 1200)
**Header:**
- a 22 game tile, the name (H1), the tag "Public binder";
- the owner row: avatar 40, handle, province, ★;
- on the right, [Message maya_k] (tonal) and "⋯" (Share, Report). Own binders show [Manage in Inventory].

**Toolbar:** "Search this binder" (320) and a sort pill (Recently added, Name, Price).

**Grid:** `auto-fill minmax(136px,1fr)`, gap 20, art ≤160:
- each tile shows the name (14/600, 2 lines), the price and ×n;
- a "Message about this card" icon button shows on hover or focus;
- a tile opens Who has this card.
- [Load more].

### 8.3 Both
- **Guests:** the owner is "A collector" with no handle, rating or presence, and the province stays. Message opens the sign-in dialog.
- **States:** skeletons; "This binder isn't public anymore."; the binder-view limit message (§6.5). Opening a page spends a view; Message never does.
- **From the phone, and why:** the swipe photo becomes a gallery with thumbnails, and the fixed bottom button becomes a sticky panel, because a pointer needs no swipe.

---

## 9. Inventory (the lead area): `/inventory`, `/inventory/import`

### 9.1 Layout at 1440
| Rail 72 | Binder pane 256 | Main 1112 (padding 24, inner 1064) | Drawer 440 when open (pushes; main inner becomes 624) |
|---|---|---|---|

- Inventory **always shows every game**. No pills show here (§4.2).
- On the Binders tab the binder pane hides and the grid takes the full width.

### 9.2 Binder pane (256)
- **Fixed rows** (40): "All cards 20" and "Unfiled 6". The counts are your own, so they are allowed.
- **One section per game:**
  - head: a 22 monogram, "YU-GI-OH!" (label style) and "3 binders";
  - binder rows (40): a 24 fan or deck-core photo, the name (14/500), a lock or globe, the count, and a small `deckCore` tag for deck cores.
- **[New binder]:** a dashed orange button at the bottom.
- **Row menu** ("⋯" on hover, or right-click): Edit binder, Make public / Make private, Move up, Move down, Delete binder.
- **Reorder** by drag within a game (`PUT /binders/reorder`); Move up and Move down are the non-drag path.
- **Drop targets** (§9.7).

### 9.3 Header and toolbar
**Row 1 (64):**
- H1 "Inventory" (28) with underline tabs **Cards 20 | Binders 4** under it;
- on the right:
  - [Import] (outline 40);
  - **[Add cards]**, an orange split button (40), the view's one orange. The caret holds "Quick add rows · Shift+N", "Import a deck (.ydk)" and "Import from Collectr (.csv)".

**Row 2:**
- the summary "**20 cards** · 31 copies · 17 public" (14 muted, bold count);
- when a binder is selected, a binder strip: the name, [Private | Public], "Edit binder", and for a deck core its price and "2 photos".

**Banners** (48, radius 12, amber tint; only when they apply):
- freshness: "For trade: do you still have these 9 cards? Confirm them, or they leave search on Oct 26." [Still have them] [Show them];
- visibility: "3 public cards aren't visible yet. Put them in a public binder or choose your province." [Show them];
- listings paused (existing state).

**Toolbar** (56, sticky at top 64):
- "Search your cards" (320);
- "Game: All games ▾";
- [All | Public | Private];
- "Sort: Recently added ▾" (Recently added, Name, Price, with a direction arrow);
- "Clear filters" (teal) when anything differs from the defaults;
- on the right, [Table | Grid] (remembered in this browser).

### 9.4 Table view (default)
- **Rows:** 72 tall, 1 px `border` dividers. The header is 40 tall, label style and sticky. `role=grid`.

| Column | Width | Content and editing |
|---|---|---|
| Select | 40 | Checkbox |
| Art | 56 | 42×60. Hover shows a 160×233 preview |
| Card | flex, min 280 | Name 15/600. Line 2: a 16 px game monogram (when All games) and the mono code · rarity (13 muted) |
| Binder | 168 | Name, or a muted "Unfiled". Click: a same-game select |
| Who can see it | 148 | The tag. Click toggles Private and Public |
| Copies | 104 | "×2". On hover or focus, a − 2 + stepper |
| Price | 136, right-aligned | "85% TCG", "$11.50", or legacy text. Click or Enter: an inline [$ \| % TCG] and a number. Enter saves, Esc cancels. Legacy text shows "Was: {text}" |
| Updated | 80 | "2 d" muted, with a `status.aging` or `status.stale` dot |
| Menu | 40 | "⋯": Edit, Move to binder, Make public / Make private, Still have it, Check TCGplayer price ↗, Delete |

**Narrower layouts.**
- **Drawer open (inner 624):** the table switches to the phone's row: Select 40 | Art 56 | Card (name; line 2 = code with the visibility tag inline) | Price 136 | Copies 72 | Menu 40.
- **md (inner 904):** Binder and Updated are dropped.

**Saving.**
- An inline save PATCHes only the changed field with `confirm: true`, so the save also confirms freshness.
- The row shows a teal check for 600 ms (static under reduced motion), and LiveAnnouncer says "Saved".
- A failure restores the old value and shows the toast "Couldn't save the price." [Try again].

**Clicking a row** (outside a control) opens the Edit drawer.

**Paging:** 100 rows per load with a "Load more" row, plus CDK virtual scroll past 300 rows. The summary keeps the full totals.

**Old data:**
- phone-made cards show the price text as typed;
- the owner-removed fields are not shown (§9.8).

### 9.5 Grid view
- `repeat(auto-fill, minmax(136px, 1fr))`, gap 16: 7 columns of about 138 at 1440, 4 with the drawer open, 10 at 1920. **The art caps at 160.**
- **Tile:**
  - art 59:86;
  - top-left, a 20 px lock or globe badge on a scrim;
  - top-right, a checkbox that shows on hover, on focus or in selection mode;
  - under the art: the name (13/600, 1 line), the code (mono 11), then the price on the left and "×2" on the right.
- A click opens the drawer. Space selects. "Select" (teal) in the toolbar enters selection mode.

### 9.6 Selection and the bulk dock
**Ways to select:** checkboxes, Shift+click ranges, Ctrl/Cmd+A (loaded rows), Space or `x`, Esc to clear.

**"Select all 340 that match"** stays hidden until an id-listing-by-filter endpoint exists (§18). Until then the strip reads "All 100 loaded cards are selected."

**Bulk dock:**
- floating at the bottom centre of the main column, 24 above the edge;
- 56 tall, `surfaceElevated`, 1 px `borderStrong`, radius 999;
- "6 selected" · Make public · Make private · Move to binder ▾ · Still have them · Delete · Clear (Esc);
- all text buttons, with Delete in `danger`. **Set price is hidden** until the additive `SET_PRICE_TEXT` exists;
- at md, icons with labels in tooltips after the 3rd action.

**What each action calls** (`POST /inventory/items/bulk`):
- **Make public / private:** `SET_VISIBILITY`.
- **Move to binder:**
  - a menu of binders grouped by game, plus "Unfiled" and "New binder…";
  - binders of another game are dimmed: "Only Pokémon cards can go in";
  - it calls `MOVE_TO_BINDER`, and results come back per item.
- **Still have them:** `CONFIRM`.
- **Delete:**
  - the dialog "Delete 6 cards?" / "They leave your inventory and any binder. Their photos are deleted too." [Delete] [Keep them];
  - then the toast "6 cards deleted" [Undo], which restores each item within 10 minutes (N restore calls until a bulk restore exists).

**Result toasts name what changed and why:**
- "Moved 4. 2 Pokémon cards can't go in a Yu-Gi-Oh! binder."
- "Made 6 public. 2 are in a private binder, so nobody sees them yet." [Make the binder public]

### 9.7 Drag and drop (CDK, Inventory chunk only)
- **Starting:** drag a row (from its art, after 4 px) or a tile. If it is part of the selection, the whole selection moves.
- **Ghost:** up to 3 fanned thumbnails and "3 cards".
- **Targets:**
  - binders of the same game show a dashed orange outline;
  - the hovered binder fills `primaryTint` and reads "Move 3 cards here";
  - binders of another game dim to 0.4, with the tooltip "Only Yu-Gi-Oh! cards can go in";
  - "Unfiled" sets `binderId: null`.
- **File drops:**
  - images dropped on the open drawer go to Photos;
  - a `.ydk` or `.csv` dropped anywhere on Inventory shows a full overlay, "Drop to import a deck or a Collectr export", and opens Import.
- **Every drag has a menu path:** Move to binder, Move up, Move down.

### 9.8 Edit card drawer (440): the phone's Edit card
**Header:**
- 96×140 art, "YU-GI-OH!", the name (Sora 20), "LAVD-EN008 · Legendary Arc-V Decks" (code in mono), "Check TCGplayer price ↗";
- top-right: Previous and Next (Alt+↑ / Alt+↓; each saves pending changes first, and a failed save stays on the card), and Close.

**Fields** (24 apart):
- Copies − 1 +;
- Asking price [$ | % TCG] and a number;
- Who can see it [Private | Public], with "Only you see it until you make it public." or "Collectors in Americas (North) can find it.";
- Binder (this game's binders, plus "No binder (unfiled)");
- Public note 0 / 500, placeholder "NM, English, 1st, for trade";
- Photos 1 / 4: four 88×88 drop slots, "Show the real card, front and back. Location data is removed."

**Legacy web-made items only:** a muted read-only line, "From the old web form: Near Mint · English · 1st Edition", with [Add to public note] (decision 7). Cards whose condition is not stated show nothing. Anywhere a condition must appear (admin), an unstated one reads "Condition not stated".

**Footer** (72):
- "Delete this card" (red text) on the left;
- [Save changes] (orange 44) on the right, disabled as "No changes yet";
- Ctrl/Cmd+Enter saves.

**Closing with changes** asks "Discard your changes?" [Discard] [Keep editing].

**Delete** asks "Delete Ash Blossom & Joyous Spring?" / "It leaves your inventory and any binder. Its photos are deleted too." [Delete] [Keep it], then the toast "Card deleted" [Undo].

### 9.9 Add cards drawer (440; `n` or "Add cards")
1. **Search.**
   - The field "Card name or code, like LOB-EN001" (48), with "The fastest way to add one card. You pick the printing next."
   - "Cards" rows: 32×46 art, the name, "Yu-Gi-Oh! · 14 printings". The count is allowed: it is your own card.
   - "Exact printings" rows: mono code, set, rarity.
   - Hint: "Click a card to pick its printing, or an exact printing to go straight to the details."
   - With an empty field, "Add many at once": Quick add rows; Import a deck (".ydk file from YGOPRODeck or EDOPro"); Import from Collectr (".csv export. You check every match before it's added"). **No camera scan** on the web.
   - Footer: "New cards start private. You choose what to publish."
2. **Printing.**
   - "14 printings. Pick the one on your card."
   - The filter "Set code or set name" and rarity chips.
   - Rows (52): 32×46 art, mono code, "{set} · {year}", rarity.
3. **Details.**
   - The §9.8 fields, then [Add to inventory] (orange 52) and "Change any of this later by clicking the card in Inventory."
   - A checkbox "Keep these for the next card" (binder, visibility, price mode), on by default.

**After adding:**
- the toast "Saved · Ash Blossom & Joyous Spring" [View];
- the new row appears at the top of the table with a 1.5 s `primaryTint` highlight;
- the drawer returns to step 1 with the field focused. "Done" closes it.

### 9.10 Quick add rows (Shift+N; keyboard-first bulk entry)
- **Entry row:** pinned at the top of the table body, 64 tall, with a 2 px orange outline when focused:
  - [Code or name 240] [printing chip] [Copies 1] [$ | % TCG + price] [Private | Public] [Binder ▾ (same game)] [Add ↵].
- **Typing:**
  - a code such as `MACR-EN036` resolves its exact printing through `/cards/suggest`;
  - a name opens a printing list under the field (↑↓, Enter);
  - Tab moves through the fields, Enter commits, Esc leaves.
- **After each commit:**
  - the new row appears below with a 1.5 s highlight and an inline "Undo" for 10 minutes;
  - the cursor returns to the code field;
  - copies reset to 1, while the price mode, visibility and binder stay.
- **Errors stay inline:**
  - "No Yu-Gi-Oh! card has that code. Try the code printed on the card, like LAVD-EN008."
  - A 429 names the limit, the usage and the reset, with "Every collector has the same limits." It never offers anything to buy.
- **API:** one `POST /inventory/items` per row, until the batch create on `feature/card-scan` is merged and reused.

### 9.11 Import (`/inventory/import`, lazy; a workspace page)
- **Header:** H1 "Import cards" and the label row "Source · Check · Done".
- **Left column (360), the source:**
  - [Yu-Gi-Oh! deck (.ydk) | Collectr (.csv)];
  - a dashed orange drop zone (312×200, 2 px, radius 16): "Drop the file here, or Choose a file";
  - the limits **read from `GET /inventory/imports/limits`**: "Up to 100 kB and 500 lines", or "Up to 2 MB and 5,000 rows". The phone board's "1 MB and 300 lines" is wrong;
  - "Paste the text of the file instead": a mono textarea of 12 lines;
  - "The preview is kept for 60 minutes."
- **Main column, the preview:**
  - before a file: "Your file's cards show here before anything is added.";
  - chips "All 70 | Which copy? 2 | Not recognised 1";
  - an amber bar "2 cards need a printing." [Use the newest];
  - table columns: include (40) | art 32×46 | name | file line (mono muted) | Printing (inline select: code · set · rarity) | Copies (stepper) | Status ("Ready" teal, "Which copy?" amber, "Not recognised" grey with its reason).
- **Sticky footer (72):**
  - "34 cards · 69 copies will be added. They start private and unfiled." (a card is one row, one printing; copies count every copy);
  - [Add 34 cards] (orange), disabled with "Choose the copy of the marked cards, or use the newest.";
  - [Discard] (outline).
- **Done:**
  - "34 cards added" (H1) and "69 copies in all. They start private. Make the ones you trade public from Inventory.";
  - [Go to my inventory] and "Import another file".
  - **Go to my inventory** opens `/inventory?imported={id}`, sorted by Recently added, with those 34 cards **already selected** and the bulk dock open (Make public, Move to binder). A strip reads "These are the 34 cards you just imported, 69 copies in all."
- **Limits:** the 30 imports an hour rate limit and the usage limits answer plainly.

### 9.12 Binders tab, Edit binder, New binder
**Binders tab:**
- the summary "**4 binders** · 1 deck core" and [New binder] (outline);
- sections per game: a 22 tile, "Yu-Gi-Oh!" (Sora 17), "3 binders";
- a card grid, `minmax(280px,1fr)`, gap 20 (4 columns at 1440 without the pane);
- **Card:**
  - cover 180: the first deck-core photo, or a fan of 3 card arts (each ≤96) on `surfaceVariant`;
  - body (16): the name (16/600), "9 cards · Public" with a globe, the `deckCore` tag "Deck core · $180", "⋯";
  - a click opens Cards filtered to that binder;
  - reorder by drag within a game, or Move up / Move down;
- the tip card: "**Selling a whole deck?** Turn on 'Sell as a deck core' in a binder. Photos, a price and a note are enough."

**Edit binder drawer (440):**
- Name, and Game read-only with a lock (spoken "Game: Yu-Gi-Oh!. It can't change once the binder has cards");
- [Private | Public];
- the switch card "Sell as a deck core" / "Photos, one price and a note" (`deckCore.switch`). When it is on:
  - Photos 2 / 4 (drop zone);
  - Asking price (free text, "$180 or Trade only");
  - Public note ("What's in it, condition, language");
  - the amber "Buyers can only find a deck core when it is public." (while Private);
  - "Key cards · optional": a chip input with a same-game card typeahead ("Yubel ×3"), "Helps buyers find it when they search a card.";
- "See its cards";
- footer: "Delete binder" (red text) and [Save changes];
- **Delete:** "Delete Trade binder?" / "Its photos, price and note go away. Your cards stay in your inventory."

**New binder dialog (520):**
- Name ("Trade binder");
- five game tiles (88×72, single choice; One Piece and Riftbound dimmed, "Cards coming soon");
- "A binder holds cards of one game. You can't change it once it has cards.";
- [Private | Public];
- the "Sell as a deck core" switch in **purple**, fixing the phone's orange one. With it on, Create opens Edit binder on the deck-core fields;
- from a selection: "Cards inside: 6 Yu-Gi-Oh! cards from your selection. Cards in another binder move here.";
- [Create binder] (orange 52).
- **Stage G 409s in plain words:**
  - `BINDER_GAME_LOCKED`: "This binder already has Yu-Gi-Oh! cards, so its game can't change."
  - `BINDER_GAME_MISMATCH`: "Only Yu-Gi-Oh! cards can go in this binder."
- **Limit:** "You have 5 binders, the most each collector can have. Every collector has the same limits."

### 9.13 States
- **Skeletons:** 8 table rows or 14 tiles.
- **Empty inventory:** "Your cards, in one place" with [Add cards], [Import a deck], [Import from Collectr] and "New cards start private. You choose what to publish."
- **No match:** "No cards match these filters." [Clear filters].
- **Error:** "Couldn't load your cards." [Try again].

### 9.14 From the phone, and why
- Rows become a table and grid, and the filter sheet becomes a toolbar, because there is room.
- Multi-select, the bulk dock, drag and inline edits make a 300-card stock manageable.
- The Add flow loops and has quick-add rows, for keyboard entry speed.
- Import is drag and drop and ends in a ready selection, so cards are public within one click.
- Same fields, words and rules as the phone.

---

## 10. Messages (`/messages`)

### 10.1 Layout at 1440
| Rail 72 | Inbox 340 | Chat (fluid, about 708; content centred at max 720) | Deal panel 320 (toggle "Deal", remembered in this browser) |
|---|---|---|---|

### 10.2 Inbox (340)
- **Header (64):** H1 "Messages" (28), then underline tabs **Chats | Community**. Chats carries an orange dot when something is unread.
- **[All | Unread]** (32).
- **Rows (76):**
  - a 44 avatar with the online dot;
  - the handle (15/600, bold when unread) and the time (12, orange when unread);
  - the last message on one line (14 muted, "You: …");
  - a 28×40 card thumbnail on the right;
  - the selected row is `surfaceVariant` with a 2 px orange inset on the left.
- **Keys:** ↑↓ or `j` `k`, Enter opens, Esc returns to the list.
- **Empty:** "No chats yet" / "Find a card and message who has it" [Search cards].

### 10.3 Chat
**Header (64):**
- avatar 36, the handle (16/600, opens the profile), "Online · Quebec" (province only);
- on the right, the "Deal" toggle (`aria-pressed`) and "⋯": "Rate {h}", Mute, Archive, "Report {h}", "Block {h}".

**Pinned subject bar (60):**
- 30×42 art, the name (14/600), "RA01-EN008 · Secret Rare" (mono 12), "$32";
- the seller also sees "· your card" and a teal outline [Mark as sold] (32). This is the only Mark as sold entry; the deal panel does not repeat it;
- after the sale, a "Sold" tag.

**Shield tip line** (36, muted, shield icon):
- buying: "Check their rating before you send an e-Transfer, and ask for tracking.";
- selling: "Ship after the e-Transfer arrives, and add the tracking number when you mark it sold."

**Thread:**
- bubbles at most 480 wide, radius 18 with a 6 px tail corner;
- mine `primary` with `onPrimary` text; theirs `chat.otherBubble`;
- day separators;
- a shared card renders as a 280 card (48 art, name, code, price, "View");
- sale notes use the `chat.sale*` tokens;
- legacy offer messages read "Offer (no longer available)".

**Composer:**
- quick-reply chips (32, outline) above it:
  - buying: "e-Transfer sent!", "Tracking number?", "Thanks!";
  - selling: "Got your e-Transfer", "Shipped!", "Thanks for buying!";
- a "+" button (40 round) opens a menu:
  - "Send my address" and "Send my e-Transfer email": a 440 dialog typed each time, with "OrenjiTrade doesn't keep this. It goes only into this chat, where you and theo.duels can see it." and [Send in this chat]. **Nothing is saved on the web** (decision 8A);
  - "Send a photo" (JPEG, PNG or WebP up to 8 MB; EXIF and GPS removed on the server);
  - "Share a card from your inventory" (a searchable 520 picker);
  - "Share a binder";
- the field "Write a message" (radius 20, grows from 1 to 6 lines);
- Send: a 40 round orange button, the view's one orange.
- Enter sends, Shift+Enter makes a new line. A dropped photo attaches.
- A failed message shows "Not sent · Try again".

### 10.4 Deal panel (320, `surface`, left border, padding 20)
- **"THIS CHAT IS ABOUT":** 96×140 art, the name, code, price, "View card".
- **Seller:**
  - "Your copies: ×2 · Public · Trade binder" with "Open in Inventory" (`/inventory?item=`, which opens the Edit drawer);
  - after the sale: "Sold Oct 20 · Tracking 1Z999AA10123456784" (mono), "Undo" while its 10 minutes last, and [Rate theo.duels].
- **Buyer:**
  - "How deals work here": 1 "Agree in the chat", 2 "The buyer pays by e-Transfer", 3 "The seller ships with tracking", 4 "Mark as sold, then rate each other";
  - "OrenjiTrade never holds the money and does not protect payments.";
  - after the sale: "duelist.jp marked it sold to you · Tracking …" and [Rate duelist.jp].
- **"WITH":** avatar 48, the handle, "★4.9 · 14 ratings", the province, "Member since 2024", "View profile". This is where the buyer checks a rating before paying.
- **Buyer only:** "More from duelist.jp", 4 tiles of 64 (no counts) with "See all", for bundling one shipment.
- **No subject:** the collector block and "Share a card from your inventory".

### 10.5 Mark as sold, Rate, Report
**Mark as sold (480):**
- "Mark as sold?";
- the card row (42×60 art, name, mono code) with Copies − 1 + up to the copies held;
- "Tracking number · optional" (mono), placeholder "So theo.duels can follow the package";
- one live sentence:
  - "Sold to theo.duels. It was your last copy, so the card leaves your inventory. You can rate each other next.", or
  - "Sold to theo.duels. You keep 1 copy in your inventory. You can rate each other next.";
- [Mark as sold] (orange 52) and [Not yet].

**Afterwards:**
- the toast "Marked as sold" [Undo];
- the teal sale note "You marked Ash Blossom & Joyous Spring as sold to theo.duels." with "Tracking {n}" and [Rate theo.duels];
- Undo stays on the note for 10 minutes;
- the buyer's bell shows the sale notification.
- Tracking numbers are seen only by the two collectors, never logged.

**Rate (560):**
- "Rate theo.duels" with "Ash Blossom & Joyous Spring · sold Oct 20";
- Overall stars with the words Poor, Not great, Okay, Good, Excellent;
- "Details · optional": Communication, Card condition, Shipping;
- Comment 0 / 600;
- "Your rating appears on theo.duels's profile with your name. You can change it for 14 days.";
- "Write a reference instead" (400 characters) and [Publish rating].

**Report (520):**
- reasons: Scam or fraud, Counterfeit cards, Harassment, Spam, Inappropriate behaviour, Misleading listings, Something else, each with its line;
- [Send report], disabled with "Choose a reason first.";
- then "Report sent" with "Done" and "Follow it in My reports".

### 10.6 Chat drawer (one at a time)
- **Opened from** "Message" or "I have it" anywhere: Home, card page, binder, deck core, profile, the Search drill-in, the Wishlist holder pane.
- **Shape:** 440 wide, right side, under the top bar, **non-modal** (`aria-modal=false`, no scrim), so you keep browsing.
- **Contents:**
  - header (56): avatar, handle, "Online · Quebec", "Open in Messages ↗", Close;
  - then the pinned bar, the tip, the thread, quick replies and the composer.
- **Behaviour:**
  - opening another chat replaces it, and its draft is kept per conversation;
  - Esc closes it when focus is inside, and focus returns to the opener;
  - F6 moves focus between the page and the drawer.
- **Below 960** it navigates to `/messages/:id`.
- One realtime subscription, shared with the Messages page.

### 10.7 Community (Messages › Community; R11 rooms)
- **Inbox column:**
  - a region pill (Community's own);
  - five game rooms (64 rows: 38 tile, game, last post, time);
  - the footnote "Every collector in Americas (North) can read these rooms. Keep deals and addresses in private chats."
- **Room (chat column):**
  - header "Yu-Gi-Oh!" / "Americas (North) · public room";
  - the banner "Every collector can read this room…";
  - posts: a 36 avatar, the handle, "Quebec · 9:12 AM", the text, a shared card or deck core (no photos: community photos are stage S4, which the owner skipped on 2026-10-13);
  - a "⋯" menu on hover or focus: "Message {h}", "Report this post", "Block {h}";
  - the composer "Write to the room" with "+": Share a card, Share a binder or deck core.
  - No reply threads.
- **Third pane:** "Room rules", with "You can post up to 10 times an hour in each room." At md it is an info button that opens a drawer.

### 10.8 md
Inbox 300 and chat. The deal panel and Room rules become a 360 drawer opened from the header.

### 10.9 From the phone, and why
- Master and detail sit side by side, because there is room.
- The deal panel puts the other side's rating beside the chat, which is safer for buyers.
- Sheets become menus and dialogs.
- Saved shipping details become typed each time, because browsers have no secure storage.

---

## 11. Profiles (`/collectors/:handle`, `/profile`)

**Container 1120.**

**Header card** (`surface`, radius 16, padding 24):
- avatar 96 with a 16 px online dot;
- the name (H1), "@duelist_jp · ★4.9" (the star scrolls to the ratings);
- the game chips (orange tint #2A1A0D / #5C3418 / #FDBA74 via tokens) and the tags;
- the fact line "Laval, Quebec · Member since 2024 · Active this week". **The city shows only here, and only while `show_city` is on.** There is no Location section and no map link (R6).
- Actions on the right:
  - another collector: [Message duelist.jp] (orange 44) and "⋯" (Share profile, "Report duelist.jp", "Block duelist.jp");
  - your own: [Edit profile], [Share profile] and a gear (Settings).

**Main column (736): cards, binders and wishes first.**
- **Cards:**
  - a 6-column grid of 112 tiles (2 rows) with prices;
  - a game segmented control when the collector lists 2 or more games;
  - "See all" expands inline with paging.
- **Binders:** 3 cards (229 wide, 120 covers).
- **Looking for:** rows 64 (40×58 art, name, terms).
  - On someone else's profile, each row has "I have it".
  - On your own, each row has "Edit". **No availability status on Profile.**

**Side column (336, sticky):**
- About (bio, games, tags, languages);
- "Ratings & references": "4.9" (Sora 36), stars, "14 ratings", the 2 latest references, "See all references".

**Your own profile:** the Cards header has [Add cards] (the one orange). "See all" goes to Inventory, Inventory › Binders and Search › Wishlist.

**States:**
- guests: the sign-in dialog "Sign in to see collector profiles", and handles never link;
- blocked and private profiles keep their existing states.

**From the phone, and why:** rails become wrapping grids, and About and Ratings move to the side, because there is width.

---

## 12. Notifications

**Bell popover:**
- 400 wide, max 560 tall, anchored to the bell, `surfaceElevated`, radius 16.
- **Header (56):** "Notifications" (Sora 17), a teal "Mark all as read", and a gear to Settings › Notifications.
- **Sections:** "NEW" and "EARLIER".
- **Rows (72):**
  - a 36 kind tile: wishlist orange heart, sale blue, rating amber star, reminder, report grey flag;
  - the text (14, with the card name bold), the sub-line (13), the time (12) and an unread dot.
- **Inline answers:** [Still have them] (orange tint 32) and [Review the binder] (outline), then "Confirmed. They stay in search."
- **Footer (48):** "See all notifications".

**Page** `/notifications` (centred 720):
- H1, [All | Unread], "Mark all as read", groups by day, [Load more].

**Rules:**
- Chats and Community posts are excluded (`excludeTypes=MESSAGE`, R9).
- Legacy offer, trade, payment and dispute kinds read as history.
- **Empty:** "No notifications yet".
- No web push.

---

## 13. Settings (`/settings/:section`)

**Container 1040:** a **nav of 248** (sticky), a 64 gap, and **content of 680** (forms at most 640).

**Nav:**
- a mini profile card at the top: avatar 48, "Sam Tremblay", "@sam_trades", "Edit profile";
- groups (label style), rows 44 with a 20 icon, radius 12; the active row is `surfaceVariant` with ink text:
  - WHERE YOU SHIP FROM: Location ("Quebec, Canada · On the map"), Shipping details;
  - APP: Notifications, Privacy, Appearance ("Same as the system");
  - SAFETY: Blocked "2", My reports "1 waiting";
  - ACCOUNT: Account, Legal;
- then "Sign out" (red) and "OrenjiTrade web 1.0.0".

**Pages:**
- **Profile:** handle, name, bio (new placeholder "What you collect and trade"), games, tags, languages.
- **Location:**
  - country and state or province (`GET /regions`), and an optional city (80 characters at most, "Only on your profile, and only if you show it") with the switch "Show my city on my profile";
  - **"Show me on the map"**: "Collectors see you in Quebec, Canada. Visitors without an account see your cards, never your name.";
  - the box "How OrenjiTrade protects where you live":
    - "…the app never uses GPS.";
    - "The map counts binders per state or province: no pin, no point, no distance.";
    - "Your city is optional and only on your profile.";
  - "Remove my location" (red text) and [Save location];
  - 409 `LOCATION_REQUIRED` answered inline.
- **Shipping details (web):** "On the web, OrenjiTrade doesn't save your address or e-Transfer email. Type them in the chat when you need them, with + › Send my address. The phone app can keep them on that phone only."
- **Notifications:** topics (Messages, Ratings, Binder reminders, Report decisions, News and tips) × App and Email; Push shows "Set on your phone". Quiet hours.
- **Privacy** (autosaved, "All changes saved"):
  - who can see your profile: Public, Members (recommended), Private;
  - who can message you;
  - "Let others see what you want";
  - "Remember my searches" with "Kept in this browser only." and "Clear my searches".
- **Appearance:**
  - three preview tiles of 200×120: "Same as the system", Light, Dark;
  - the switch "Keyboard shortcuts: single-key shortcuts (/, n, g then a letter, ?)";
  - the API environment line only on non-production builds.
- **Blocked, My reports:** as today.
- **Account:** email, password, export my data, and "Delete account" (a dialog).
- **Legal:**
  - EN / Français and the "Draft." banner;
  - 7 documents, with Payment Protection and Refund & Dispute hidden while `protectedPayments` is off;
  - Trading safely;
  - documents read in a 680 column.

Offers and Payouts are removed.

---

## 14. Sign-in, welcome, account states, guests

**Sign in (`/auth/sign-in`):** a split page without the rail.
- **Left form panel (560):** a 400 column, with "Not now, keep browsing" at the top:
  - the wordmark (Sora 32);
  - "Find collectors in your region who own, trade or want the cards you care about.";
  - email and password (48 each), "Forgot your password?" (teal);
  - [Sign in] (orange 52), "or", [Continue with Google] (outline 52);
  - "New to OrenjiTrade? Create an account".
- **Right panel (880, `surfaceVariant`):** a decorative choropleth of Americas (North) in the five steps, a fixed pattern with no live data (aria-hidden), and "Who in my region has this card?" (Sora 30).
- Below 960, the form only.

**Sign up:**
- "Accept all" for the documents;
- the 18+ line in English and French, separate and never covered by "Accept all";
- reason lines such as "Accept the documents and confirm your age to continue."
- Verify email and reset password use the same panel.

**Welcome (`/onboarding`):** a centred 560 card, "Step n of 3", a 3-part bar, Back and Continue (52):
1. "Who are you?": the handle with a live check ("@sam_trades is free").
2. "What do you collect?": five 96 tiles, "Opens first" on the first pick, coming-soon games dimmed.
3. "Where do you ship from?": "We never use GPS and never ask for your address.", country and province, an optional city, and "Show me on the map" (off by default).

Finishing goes to Home.

**Account states** (centred 480 cards): Consent; Suspended; "scheduled for deletion" with [Cancel deletion] and "Download my data"; "We could not load your account" [Try again].

**Guests (R15; must not ship before R15):**
- **Open pages:** Home, Search (Cards and Binders), card, set, binder and deck core pages, Legal and Appearance.
- **Identity:** collectors show as "A collector" with a plain grey avatar, no rating and no presence. The province stays.
- **Guest pages** (520 column, a 64 icon tile, Sora 30, [Create account] orange, [Sign in] outline):
  - Inventory: "Your cards, in one place";
  - Messages: "Talk to collectors";
  - Profile: "Your collector profile", also listing Appearance, Trading safely and Legal.
- **Sign-in dialog (440):**
  - titles: "Sign in to message this collector", "Sign in to tell them you have it", "Sign in to see collector profiles", "Sign in to save your wishes";
  - "It's free. When you're done, you come right back here.";
  - [Create account] (orange), [Sign in], "Not now";
  - the pending action resumes after sign-in (kept in the router state).

---

## 15. The admin console (`/admin`, boards A1 to A24)

The owner asked on 2026-10-20 to upgrade the admin console ("I think there is the admin page left to upgrade"). It is redesigned in the new look (decision 3), not only reskinned. **Every function, filter, dialog, validation message, empty state and error of today's 22 pages stays** unless this section removes it; the boards show where each one lives now. Staff only: 1 to 3 people, on a desk. It stays its own lazy chunk.

### 15.1 Way in and the shell
- **Way in:** the rail's shield "Admin" item and "Admin console" in the account menu (staff only, §4.6, §4.7).
- **Top bar (64):**
  - the wordmark, a divider and "Admin console" (Sora 15, `textSecondary`); the wordmark opens the Overview;
  - the staff search "Find a collector, card or report" with `/` (a handle, an email, a card name, a printing code or a report number; results in a dropdown grouped Collectors / Cards / Reports, Enter opens the first);
  - the role pill (shield, teal tint): "Super admin", "Admin" or "Moderator";
  - "Back to OrenjiTrade" (outline), then the avatar (opens the same account menu as §4.7).
  - There are no region or game pills: admin lists filter per page.
- **Nav (260), grouped, replacing today's flat list of 22:**
  - Overview;
  - MODERATION: Reports, Flags and rules, Community, Ratings;
  - COLLECTORS: Users, Listings, Binders;
  - CATALOG: Cards, Card data and images, Games;
  - RULES: Usage limits, Import limits, Wishlist terms, Auto-delist, Feature flags, Regions;
  - SYSTEM: Notifications, System health, Analytics, Audit log;
  - PAYMENTS (Transactions, Disputes, Payments, today's pages restyled): **only while `protectedPayments` is on**. Today the shell shows them always; it must read the flag.
- **Nav details:**
  - items are 40 tall, a 20 px icon and the label; the active item has the orange tint and `aria-current="page"`;
  - Reports and Flags and rules carry orange counts of open items (from the dashboard call, refreshed with it);
  - the footer line reads "Every staff action is recorded in the audit log."
  - Below 960 the nav becomes a grid of items above the page, as today.
- **Moderators** see Overview and the four MODERATION items only. Admin-only routes keep `adminGuard`.

### 15.2 Page pattern (every admin page)
- **Header:** an eyebrow with the group name, H1 (Sora 28), a one-line subtitle, actions on the right (Refresh where today's page has it).
- **Body:** filters in one wrapping row (segmented tabs for states, selects, search fields; all in the URL as today), a count line, then a card holding the table or list. Pagination as today (20, or 25 for the audit log).
- **People** show as avatar + name + @handle. **Never** a raw UUID (today: ratings, feature flags, audit targets): use the handle, the report number, the setting key or the room name. Regions are always named ("Americas (North)"), never `americas-north`.
- **Places:** only the account page header shows the declared state or province and the country. No admin list shows a place; a city never appears.
- **Every write** ends with a toast, "{result}" + "Recorded in the audit log." Destructive or wide writes confirm first (today's dialogs and wording).
- **Chips** keep today's tones: report Open warning, Under review info, Action taken danger, Dismissed success; account Active, Suspended, Deletion pending, Deleted; listing Fresh, Aging, Stale, Hidden.
- **States:** skeletons, today's empty states, errors with the request id and "Try again".

### 15.3 Overview (A1; moderators A24)
- **"Needs a person":** Open reports (5, counted as the dashboard does, Open and Under review together: "2 unassigned · 3 under review"; taking a report moves it from Open to Under review), Open flags, Listings to review (stale + hidden), Failed notifications (24 h). Non-zero queues get the amber tile.
- **Report queue:** the open reports with "Assign to me" on unassigned ones; **Open flags**; a **System** card (status, database, cache, events waiting, the last freshness run, the card image cache meter "3,413 of 5,120 MB" split by game); **Recent staff actions** (the last 5 audit entries).
- **Collectors:** Accounts (active · suspended · deletion pending · new this week), Active collectors (7 days), Public listings (in N public binders), Paused listings.
- The Open disputes and Webhook failures tiles show only while `protectedPayments` is on.
- **Moderators (A24):** Open reports (counted like A1: Open and Under review together; today's moderator tile counts Open only), Under review, Open flags; "Assigned to you"; "Unassigned" with "Assign to me"; and "What moderators decide" (suspending or banning is an administrator's decision: the moderator writes what they recommend in a note on the report, and an administrator decides). The staff search reads "Find a report by its number" for moderators.

### 15.4 Moderation
- **Reports (A2, A3):** one split view instead of a list page and a detail page; the URL still names the report (`/admin/reports/:id`).
  - Left (400): status tabs (Open, Under review, Action taken, Dismissed, All), Reason, "Assigned to me", "Only @handle" when filtered to one collector. Rows show the reported collector (a red "3 open" pill when several), reason, context, time and assignee.
  - Right: everything today's detail page has (facts, the reporter's details, the conversation's latest messages, moderator notes, the reported collector, the reporter with "Never reveal who filed a report…", the five history sections, collapsible).
  - **The conversation never shows a shipping address or an e-Transfer email:** a line says it was shared ("Shipping address shared · hidden from staff"). Message states and kinds read as words, never codes.
  - **Resolve (A3)** is today's dialog: decision radio cards, action radio cards (Suspend and Ban marked "Admins", disabled for moderators with "Administrators only."), "Suspended until (optional)", the required staff-only note, "Tell the reporter the report was reviewed". The confirm button names the action ("Suspend and resolve", danger for suspend and ban).
- **Flags and rules (A4)** replaces Moderation and the Community page's duplicate flags tab.
  - Tabs: Flags (first) and Rules.
  - Flags add a Subject filter (the API's `subjectType`), the rule that fired, and for community content its room and text with "Open the post".
  - **A private message's text is never shown in a flag:** "Its text is shown only inside a report about this collector."
  - Rules keep today's filters, groups, dialog, validation, lock line for moderators, and the delete confirmation.
- **Community (A5), after phone R11:**
  - The rooms grid: 3 regions × 5 games, each cell showing posts today, the hourly limit and Open or Archived.
  - A cell opens the room drawer: name, description, posts per member per hour, position, the slug read-only, "Open the room", Archive or Restore, Save.
  - "Archived channels" below. **No "New channel":** the apps only list the rooms.
  - Removing posts stays in the room (its menu), as today.
  - Before R11, the same page lists today's channels with region names.
  - Fix the stale bar text "Region channels are per city and game".
- **Ratings (A6):**
  - Tabs Ratings and **References** (new screen for the existing hide and unhide reference endpoints).
  - Filters: state, "Rated collector", "Rated by" (the API's `raterId`).
  - The rated collector shows as @handle, never "collector 3f2a…".
  - Criteria show as stored; old meetup criteria only on old rows.

### 15.5 Collectors
- **Users (A7):** today's table and filters, page size 20/50/100, no place column.
- **Account (A8):** a header, then two columns.
  - Header: avatar, name, @handle, email with the verified mark, status, joined, last active, and "Florida, United States".
  - Header actions: Pause listings and Suspend, with today's rules for disabled buttons.
  - Main column: Moderation (facts, reports about them, ratings received, open flags, removed community content, suspensions and pauses) and Recent activity.
  - Side column: Public listings (status, strikes, Pause or Resume), Roles (today's checkboxes and locks), Account deletion, and Consents. The Payment Protection and Refund lines are hidden while the flag is off.
- **Listings (A9):** today's tabs, filters, rows, Restore and Hide.
- **Binders (A10):**
  - today's page, plus a Kind filter (Binder or Deck core) and an Owner filter (the API's `ownerId`);
  - deck cores carry the violet chip;
  - a public binder or deck core links to its page.
- **Audit log (A23):**
  - Filters:
    - Action, grouped by area with labels for every action the API writes, including the seven unlabelled today: `card_images.cache.*`, `community.post.delete`, `community.reply.delete`, `inventory.import.settings.update`, `wishlist.settings.update`, `region.country.update`, `user.suspension.expired`;
    - Who (staff names, System, Collectors);
    - a Target search (a handle, a report number or a setting key);
    - From and To.
  - Rows show "Who" with the name, the label with the raw code under it, and a readable target.
  - Details expand to the JSON and the request id.

### 15.6 Catalog
- **Cards (A11):**
  - today's search, game filter and table;
  - the card editor moves into a 520 drawer beside the list, with today's card form, the schema attributes, the printings table and the printing dialog;
  - **new, on existing endpoints:** "New card" (`POST /admin/cards`) and "Add printing" (`POST /admin/cards/{id}/printings`).
  - The printing's stored market price is staff-only.
- **Card data and images (A12):** today's catalog sync panel becomes a page.
  - A "Games and sources" summary: cards, images, MB and the last sync per game. One Piece and Riftbound read "No source yet · collectors see Cards coming soon".
  - "Run a sync":
    - Game, Source, Mode, and **Images** (the API's `imageMode` and `imageLimit`: only images in use, all, none, or up to N);
    - the etiquette line: checks the source's version first, reuses the stored snapshot, at most 5 requests a second.
  - "Recent runs": the phase while running, and a **Report** drawer (`GET /catalog/sync-runs/{id}/report`, no screen today).
  - "Card image cache" (`GET /admin/card-images/status`, no screen today):
    - the meter split by game, the status counts and the reconciled date;
    - "Check the cache" (`POST /reconcile`);
    - "Clear a game's images…" (`POST /clear` with a game, confirmed, danger);
    - the 5 GB cap line.
- **Games (A13):**
  - the list shows each game's status and its cards ("13,942 cards" or "Cards coming soon", from stage G's `hasCards` and the catalog counts);
  - the editor keeps today's fields, the schema JSON with "Format", live validation and the preview;
  - games without cards get an amber panel explaining what collectors see;
  - **New game** (`POST /admin/games`).
  - **There is no launch state in the API.** "Coming soon" is derived from having no cards, so no new column is needed.

### 15.7 Rules and system
- **Usage limits (A14):**
  - today's rows, grouped: Browsing, Collection, Wishlist, and "Not in the apps" for `offers.per_day`;
  - the inline editor and today's validation;
  - the lock line for admins who aren't super admins;
  - an info line: counters reset at 00:00 UTC, and signed-out visitors are limited by address (60 requests a minute).
- **Import limits (A15), new page** on `GET/PUT /admin/inventory/import-settings`:
  - .ydk: largest file (kB, 1–1024) and most lines (10–5000);
  - Collectr CSV: largest file (kB, 16–8192) and most rows (10–20000);
  - previews and results kept (minutes, 5–1440);
  - "Last changed {date} by {name}" and Save.
- **Wishlist terms (A16):**
  - the textarea becomes an ordered list of terms, with drag and move buttons, remove, and "Add a term";
  - today's validation;
  - a preview of a wish row, with no price amount.
- **Auto-delist (A17):** today's editor; the timeline updates live.
- **Feature flags (A18):**
  - readable names with the key;
  - "Changed {date} by {name}" (no UUID);
  - the rollout percent editable for flags that are on (the API accepts it);
  - today's confirmations;
  - `protectedPayments` carries the ADR 0018 note;
  - `mlScanning` is shown locked, "On hold by the owner", and its switch is disabled in the UI.
- **Regions (A19):**
  - three region cards and their countries (region select, Active switch, Save);
  - subdivision counts;
  - long lists collapse;
  - moving a country confirms first.
- **Notifications (A20):** today's stats (period, tiles, by type, delivery channels) and the broadcast form (now "Send an announcement"), with its audience radio cards and confirmation.
- **System health (A21):**
  - today's banner, components, queues and jobs, with every job **named and explained**. For example, `inventory-import-purge` reads "Import clean-up" and `inventory-photo-purge` reads "Photo clean-up after deletes"; `card-images-reconcile` and `card-images-clear` are named too.
  - Offer expiry and payout release jobs show only while `protectedPayments` is on.
  - A Storage card shows the card image meter.
- **Analytics (A22):** today's period, total, per-day chart and by-event bars, plus two derived tiles: searches without results (%) and messages per wish added.

### 15.8 API changes the console needs (stages WH1 and WH2, all additive)
1. **Report numbers:** a short number per report (a sequence column, with existing reports numbered by date), shown as "#1047" and searchable.
2. **Names instead of ids:**
   - the rated collector's handle and name on admin ratings;
   - `updatedBy` as name and handle on feature flags, usage limits and import settings;
   - a readable target label on audit entries.
3. **Flags:** the room and text of a flagged community post or reply. Never a private message's text.
4. **Report conversation:** a shipping-address or e-Transfer-email message is sent to staff as its kind only, without its content.
5. **References:** an admin list endpoint, if none exists, for the References tab.
6. **Staff search:** one endpoint for the top bar (handles, emails, card names, printing codes, report numbers), admins only. Moderators search reports only.

Everything else uses endpoints on origin/main 3d56a090.

### 15.9 Tests
- **Each role's nav and pages:** moderators get 5 items; admins don't get flag, limit or role-grant edits; super admins get everything.
- **The payments group:** it follows the flag.
- **Raw values:** no UUID or region code in the visible text of any admin page (a Playwright check).
- **GeoPrivacyContractTest:** extended to the new admin responses. No city, no coordinate.
- **E2E:**
  - resolve a report with a warning;
  - edit an import limit and see the phone's import read it;
  - archive and restore a room;
  - clear one game's images on the E2E database (no provider call).

---

## 16. Narrow (<960): the phone design in the browser (decision 4A)
- **Navigation:** the phone's per-tab top bars (H1 Sora 28, pills on Home and Search, bell) and the bottom tab bar (Home, Search, Inventory, Messages, Profile; Messages badge).
- **Overlays:** popovers become bottom sheets (Region, Game, Filters, "⋯", "+"), drawers become full-screen sheets, and the chat drawer becomes `/messages/:id`.
- **Search:** a full-width map with the phone's state card ("See binders").
- **Inventory:**
  - 72 tall rows with 42×60 art;
  - the bulk dock above the tab bar;
  - no drag (Move to binder) and no quick-add rows.
- **Toasts** sit above the tab bar.
- **sm:** content is centred at 640.
- **Copy** names the browser, not the phone.
- A non-blocking "Get the app" banner can come later, once store builds exist.

---

## 17. Guardrails checklist (every screen)
**Privacy and places**
- No coordinates, distances, radius, "near you" or "km away".
- No geolocation, IP geolocation or geocoding.
- Places are "{province}" or "{province}, {country}".
- The city only in its owner's profile header.

**Counts**
- No counts in search results.
- Allowed counts only: your own inventory and binders, map binder and deck-core counts, "Wishlist N", unread chats, ratings, "{n} of your cards", printings while adding your own card, and the set header.

**Maps**
- Shaded only by binder counts.
- Never by a card's holders.
- No people or pins.

**Deals and money**
- No offer, trade, checkout, dispute, meetup, store or pickup UI or wording.
- No buyer-protection or escrow claims.
- Free for all: no premium, ads, credits or donations.
- Limits are plain and offer nothing to buy.

**Images and prices**
- Card art only from `/public/card-images/{id}`, at most 160 CSS px.
- TCGplayer is a plain link.
- No market prices.

**Device features**
- No camera or scan on the web.

**Guests**
- Guests see no identity (R15).

**Server rules the UI relies on**
- Blocks are excluded server-side.
- Every new endpoint that returns places joins `GeoPrivacyContractTest`: the deal panel's "More from", the feed, rooms.

**Storage and analytics**
- Recent searches stay in localStorage only and honour "Remember my searches".
- The address and e-Transfer email are never stored.
- Tracking numbers never go into logs or analytics.

---

## 18. API needs

**Already on origin/main:**
- `/search/suggest`, `/search/collectors`, `/cards/suggest`;
- `/inventory/items` (filters, sort, paging), `/items/bulk` (SET_VISIBILITY, MOVE_TO_BINDER, CONFIRM, DELETE), `/items/{id}/restore`;
- `/inventory/imports` (preview, rows PATCH, bulk, commit) and `/imports/limits`;
- `PUT /binders/reorder` and binder photos;
- conversations with `subjectItemId` / `subjectBinderId`;
- `POST /conversations/{id}/sales` (quantity, trackingNumber) and `/sales/{id}/undo`.

**Phone stages the web waits for:**
- stage G (`game=` on counts, binders, suggest and holders; `binder.game_id`; the 409s);
- R7 `GET /feed`;
- R9 `excludeTypes`;
- R11 region × game rooms;
- R15 guest anonymisation.

**Admin console (stages WH1 and WH2):** the six additive changes in §15.8.

**New and additive (each control stays hidden until its API exists):**
- the bulk action `SET_PRICE_TEXT`;
- a bulk restore (otherwise N restores);
- an id listing by filter, for "Select all that match";
- the import commit returning the created item ids (check), for the preselection after import;
- reuse of the `feature/card-scan` batch create once merged.

---

## 19. What changes from the phone, and why (summary)
| Phone | Web | Why |
|---|---|---|
| Bottom tab bar | 72 px rail, same order and labels | Pointer reach, vertical room |
| Search screen (typing) | Top-bar search with `/` and Ctrl/Cmd+K, plus the Search pane field | Search from anywhere |
| Bottom sheets | Anchored popovers and menus; dialogs for confirmations | Desktop convention |
| Filter sheet | Inline toolbar | Room to show filters |
| Item list | Table or grid, multi-select, bulk dock, drag, inline edit, quick-add rows | Sellers managing hundreds of cards |
| Edit and Add screens | 440 drawers beside the list, with Previous/Next and an add loop | Never leave the list |
| Map, then state card, then Binders | Map beside the list; a state click lands in Binders | One step fewer |
| Chat screen | Inbox, chat and deal panel; a chat drawer elsewhere | Context beside the conversation |
| Saved address and e-Transfer email | Typed each time, never saved | No secure storage in browsers |
| Pull to refresh | Refresh button and an uncounted "New posts" pill | No touch |
| Camera scan | Not offered | ML hold, `camera=()` |
| "on this phone" copy | "in this browser"; "Same as the system" | Accuracy |

---

## 20. Fixes from the judging
- **No tinted holder mini map** (Proposal 1's ADR 0017 violation). The card page uses "Jump to" province chips, and §6.4 and §17 carry the explicit rule "Never shade any map by a card's holders".
- **No wishlist availability on Home** (Proposal 3's violation of the owner's 2026-10-19 order). Own-profile wish rows show no availability either.
- **Card art capped at 160 CSS px everywhere:** hero 160×233, no card-art lightbox, the Add preview ≤160, drill-in tiles ≤149.
- **Token breakpoints only:** the third Search pane opens only at xl ≥1920, with no custom 1600.
- **Material restyled through M3 system tokens, not replaced** (no ADR). The new shell replaces the old shell rather than adding to it.
- **Theme follows the system by default**, designed dark-first.
- **Pill scope as on the phone**, which fixes Proposal 2's flagged confusion.
- **One chat drawer** instead of two docks.
- **Ctrl/Cmd+Z** fires only outside editable fields.
- **Dropped from Proposal 2:** "Your desk" and the "Card text" disclosure. Bulk Set price and "Select all that match" are hidden until their APIs exist.
- **Legacy condition handling** follows fork 7: no field and no fake value; "Condition not stated" wherever a condition must appear; old web data is shown read-only with "Add to public note".
- **Stale copy replaced:**
  - the meetup safety notice (now the shield tips and Trading safely);
  - the "accepts offers" meta description (new: "Find who in your region owns, trades or wants the trading cards you're after.");
  - the legal meetup lines (left for the lawyer, flagged);
  - the "Where do you like to meet?" placeholder;
  - the Offers and Trades links in the Messages header;
  - the "Make an offer" fallbacks.

---

## 21. Bundle and build notes
- The initial bundle is about 896 of 900 kB. The new shell must **replace** today's top bar, card-search-box, sidenav and bottom nav.
- Every area is a lazy route.
- **Chunks:**
  - Leaflet only in the Search chunk;
  - the Home mini map and the sign-in art are static SVG from the lazily fetched boundaries;
  - CDK drag-drop and virtual scroll only in Inventory;
  - the chat drawer is a lazy chunk shared with Messages;
  - Import and admin are their own chunks.
- **Suggested order when the owner resumes the web:**
  1. tokens and shell;
  2. Inventory and Import (the delivery report's first item);
  3. the Messages deal chat;
  4. Search and the card page (after stage G);
  5. Home (after R7);
  6. guest mode (after R15).

---

# Owner decisions (2026-10-20)

**Each decision is listed with the default this spec draws.** Anything marked "owner check" is drawn as described, but the owner can remove it.

**Product shape**

1. **Resuming the web at all.** The web stays paused (CLAUDE.md rule 9). This spec is design only, and building it needs your order.
   - Suggested build order: tokens and shell; Inventory and Import; the Messages deal chat; Search and the card page (after stage G); Home (after R7); guest mode (after R15).
2. **Offers, trades, protected payments and disputes on the web.**
   - Default: removed from the web UI. The old routes redirect to Messages with "Offers are no longer available. Deals happen in the chat." Old offer messages read as history.
   - The server modules stay. Deleting them needs a new ADR (an ADR 0018 follow-up).
3. **The admin console.** You asked on 2026-10-20 to upgrade it, so it is redesigned in the new look (spec §15, boards A1 to A24), keeping every function of today's 22 pages. Claude's defaults:
   - a grouped nav (Moderation, Collectors, Catalog, Rules, System) with open counts, an Overview of what needs a person, and a staff search;
   - Reports as one split view; one Flags and rules page (no duplicate flags tab in Community); private message text never shown in a flag, and shipping addresses and e-Transfer emails never shown to staff in a reported conversation;
   - Community as the 15 rooms of R11 (region × game), with no "New channel";
   - new screens on endpoints that already exist: Import limits, the card image cache, the sync report, References, New game, New card, Add printing;
   - "Cards coming soon" comes from a game having no cards, with no new launch state;
   - Transactions, Disputes and Payments only while `protectedPayments` is on; `mlScanning` shown locked;
   - six small additive API changes (spec §15.8), among them a short report number ("#1047").
4. **Guest browsing.** Default: the phone's R15 rule. Guests see "A collector" and the province only, and any action opens the sign-in dialog, which resumes the action afterwards.
   - Guest web pages must not ship before R15. Today's API still sends handles to signed-out callers.
5. **Narrow screens.** Default: responsive down to 360 px using the phone's design, with a "Get the app" banner later once the app is in the stores.
6. **SEO.** Default: no indexing for now. Only the landing and legal pages are prerendered. Prerendering the catalog (card and set pages) later is your call. People pages (profiles, binders, holders) stay noindex.
7. **One game at a time on the web.** Default: yes.
   - The game pill scopes Home and Search only.
   - Inventory shows every game, with binders grouped by game.
   - Chats and the bell show every game.
8. **The card model.** Default: the phone's model (copies, $ | % TCG, Public/Private, binder, public note, photos).
   - Old web-made items that carry condition, language or edition show them as a read-only line, "From the old web form: …", with an "Add to public note" button. They are never migrated automatically.
   - An unstated condition reads "Condition not stated" wherever a condition must appear.
9. **Address and e-Transfer email on the web.** Default: never saved. They are typed each time in the chat's "+" menu. That is more friction than on the phone, but browsers have no secure storage.
10. **Market prices and card text on the card page.** Default: both dropped. Only the "Check TCGplayer price" link stays, as on the phone.
11. **Community.** Default: R11, one room per region × game.
12. **Default theme.** Default: follow the system, designed dark-first. The alternative is starting in dark, like new phone installs.
13. **Notifications.** Default: R9. The bell leaves out chats and Community posts, and there is no web push.

**Limits and layout**

14. **The binder view limit (30 a day for members).** Desktop drill-ins make binders cheap to open.
    - Default: no change. A view is spent only on an explicit open, never on hover or prefetch.
    - You may want to raise the limit in /admin/usage-limits. Also look at the asymmetry: guests are only IP rate-limited.
15. **Clicking a state on the Search map.** Default: it goes straight to that state's binders list, one step fewer. The alternative keeps the phone's state card with "See binders".
16. **Home side modules.** Default: no "Your desk" (own counts and confirmations) and no wishlist availability. The Home rail holds only Get started or the guest card, plus the map card, following your 2026-10-19 remark.
17. **Card page seller hook.** Default: an outline "I have this card" button that opens the Add drawer for that card. It departs from the phone. **Owner check.**

**Web-only power features**

18. **Web-only features beyond the phone.**
    - Default, included:
      - quick-add rows (Shift+N);
      - inline price and copies edits;
      - drag cards into same-game binders (each drag has a menu equivalent);
      - the "Add from this set" mode on set pages;
      - the non-modal chat drawer;
      - the deal panel's "More from {seller}" rail;
      - after an import, the imported cards open already selected.
    - **Owner check** on each one.
19. **Bulk actions that need new additive API.**
    - Default: the controls stay hidden until the API exists:
      - bulk "Set price" (`SET_PRICE_TEXT`);
      - "Select all that match" (an id listing by filter);
      - bulk Undo (a bulk restore, otherwise one restore call per card).
    - Also check that the import commit returns the new item ids, which the post-import selection needs.
    - Asking for these when the web resumes is your call.
20. **Table density.** Default: 72 px rows with real card art, as on the phone, plus a grid view. A 56 px "compact rows" option is not offered.

**Tokens and copy**

21. **Token changes.** These are shared with the phone.
    - **Accessibility fix:** light `onPrimary` changes from white to ink #1C1917, because white on #F4761A is only 2.8:1.
    - **Deck cores and the deal chat:** remove the mobile-only marker from `deckCore` and `chat` when the web ships them.
    - **New colour tokens (all additive):** map steps, game monograms, notification kinds, text secondary and faint, input border, orange and teal tints, destructive fill, photo backdrop.
    - **New size tokens:** font sizes 11, 13, 15, 17 and 28; radii 12, 14 and 22.
    - Default: yes.
22. **Mockup mismatches settled by this spec.**
    - The online dot uses the token #4ADE80.
    - "Available" on wishes is teal.
    - The deck-core switch is purple in New binder too.
    - Import limits are read from the server (100 kB / 500 lines for decks, 2 MB / 5,000 rows for CSV), not the phone board's "1 MB and 300 lines".
23. **Legal index.** Default: hide the Payment Protection and Refund & Dispute policies while `protectedPayments` is off.
    - The meetup lines in the legal texts stay flagged for the lawyer.
    - The stale web copy is replaced in the design: the meetup safety notice, the "accepts offers" meta description, the "Where do you like to meet?" placeholder, and the Offers and Trades links.
24. **Keyboard.** Default:
    - the shortcuts `/`, Ctrl/Cmd+K, `g` then a letter, `n` and Shift+N, with an off switch for single-key shortcuts in Settings › Appearance;
    - Ctrl/Cmd+Z repeats the last Undo only when focus is outside a text field.
