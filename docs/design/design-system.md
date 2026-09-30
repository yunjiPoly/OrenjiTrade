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
| `font.display` | "Sora", system-ui | Sora | wordmark, page titles |
| `font.body` | "Inter", system-ui | Inter | everything else |
| `font.mono` | "JetBrains Mono" | monospace | set codes, collector numbers |
| Scale | 12 · 14 · 16 · 18 · 20 · 24 · 30 · 36 px | same | line-height 1.5 body, 1.2 headings |

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

## Card condition labels

`MINT (M)`, `NEAR_MINT (NM)`, `LIGHTLY_PLAYED (LP)`, `MODERATELY_PLAYED (MP)`,
`HEAVILY_PLAYED (HP)`, `DAMAGED (DMG)`. Display the abbreviation as a chip with full label as
tooltip/accessible name. Games may narrow this vocabulary through their `GameSchema`.

## Icons

Material Symbols (rounded) on web via Angular Material; `@expo/vector-icons`
(MaterialCommunityIcons) on mobile. Never mix icon families on one screen.

## Components that must exist in both clients

Collector marker/preview, binder card, inventory row/card, condition chip, freshness badge,
availability chip, empty state, error state with retry, skeleton loader, report-collector
dialog, offer summary, notification item.

## Accessibility

WCAG 2.2 AA: 4.5:1 text contrast, visible focus rings (2px accent), all map interactions
reachable by keyboard (marker list alternative), reduced-motion respected, labels on every
icon-only button.
