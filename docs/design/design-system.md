# OrenjiTrade design system

Shared by web (Angular Material M3 theme) and mobile (React Native styles). Source of truth is
`packages/design-tokens` (`tokens.json` → `tokens.css` + `tokens.ts`). Do not style pages
independently; consume tokens.

## Brand

- Name: **OrenjiTrade** (always this casing). Temporary text wordmark: "Orenji" in the
  brand orange + "Trade" in ink, set in the display font. No logo until assets are supplied.
- Primary: Orenji orange `#F4761A` (light) / `#FF8F3D` (dark). Accent: deep teal `#0F766E`.
  Ink (text): `#1C1917`. Surfaces: warm neutrals (`#FFFBF7`, `#F5EFE8`) / dark (`#141210`, `#1E1B18`).

## Typography

| Token | Web | Mobile | Use |
| --- | --- | --- | --- |
| `font.display` | "Sora", system-ui | Sora | wordmark, screen titles, big numbers |
| `font.body` | "Inter", system-ui | Inter | everything else |
| `font.mono` | "JetBrains Mono" | JetBrains Mono | card codes, set codes, collector numbers, tracking numbers |
| Scale | 12 · 14 · 16 · 18 · 20 · 24 · 30 · 36 px | same | line-height 1.5 body, 1.2 headings |

The phone bundles the three families with `expo-font` (the pinned `@expo-google-fonts/sora`,
`@expo-google-fonts/inter` and `@expo-google-fonts/jetbrains-mono` packages; stage R1 of the
phone redesign) and holds its splash screen until they are loaded. Each weight is its own family
on React Native, so the phone's `Text` and `TextInput` map the requested family and weight to the
loaded face (`apps/mobile/src/theme/fonts.ts`): Sora 600 / 700, Inter 400 / 500 / 600 / 700,
JetBrains Mono 500.

## Spacing, radius, elevation

Spacing scale (px): `4 8 12 16 20 24 32 40 48 64`. Radii: `sm 6`, `md 10`, `lg 16`, `pill 999`.
Elevation: use subtle shadows only on floating elements (map preview card, bottom sheet,
menus). Borders (`1px` neutral-200/800) elsewhere.

## Breakpoints (web)

`xs <600`, `sm 600–959`, `md 960–1279`, `lg 1280–1919`, `xl ≥1920`. The map page shows the
messages side panel from `md`; below that it becomes a bottom sheet/drawer.

## Status indicators

| Concept | Values | Colour token |
| --- | --- | --- |
| Freshness | Fresh (≤14d) · Aging (15–30d) · Stale (31–45d) · Hidden (>45d, until confirmed) | `status.fresh` green · `status.aging` amber · `status.stale` orange-red · `status.hidden` neutral |
| Availability | Collection only · Trade · Sale · Trade or sale · Accepting offers · Not available | chips: neutral · teal · orange · gradient · violet · neutral-outline |
| Visibility | Private · Public · Temporarily public (with countdown) | lock icon · globe icon · timer icon |
| Online | Online · Recently active · Offline | dot green · dot amber · none |
| Deck core (phone) | The purple "Deck core · {price}" tag and the "Sell as a deck core" switch | `deckCore.tagBackground` · `deckCore.tagText` · `deckCore.switch` |

The `deckCore` family (phone redesign, 2026-10-14): dark `#2E2547` tag background, `#C4B5FD`
tag text, `#8B5CF6` switch (the mockup's values); light `#EDE9FE`, `#5B21B6`, `#7C3AED` (the
same violets, picked for contrast on the light surfaces: 7.6 : 1 for the tag text, as dark has
7.7 : 1). The group is marked `"$platforms": ["mobile"]` in `tokens.json`, so `tokens.css` leaves
it out: the paused web has no deck cores, and its initial bundle has no room for unused custom
properties. Remove the marker the day the web shows deck cores.

**Theme on the phone:** a new install starts in the dark theme (owner default, phone redesign
section 16); Settings → Appearance keeps System / Light / Dark and every screen works in both.

## Card condition labels

`MINT (M)`, `NEAR_MINT (NM)`, `LIGHTLY_PLAYED (LP)`, `MODERATELY_PLAYED (MP)`,
`HEAVILY_PLAYED (HP)`, `DAMAGED (DMG)`. Display the abbreviation as a chip with full label as
tooltip/accessible name. Games may narrow this vocabulary through their `GameSchema`.

## Icons

Material Symbols (rounded) on web via Angular Material; `@expo/vector-icons`
(MaterialCommunityIcons) on mobile. Never mix icon families on one screen.

## Components that must exist in both clients

Collector card (name, state or province and country, rating), binder card, inventory row/card,
condition chip, freshness badge, availability chip, empty state, error state with retry, skeleton
loader, report-collector dialog, offer summary, notification item.

## Accessibility

WCAG 2.2 AA: 4.5:1 text contrast, visible focus rings (2px accent), all map interactions
reachable by keyboard (the state list is the map's alternative), reduced-motion respected, labels
on every icon-only button.
