# ADR 0006 — Angular for web, React Native + Expo for mobile

**Status:** Accepted · **Date:** 2026-09-29 · **Amended:** 2026-10-06 (Expo SDK 57 → 58)

## Context
Product requirement (spec §4). Web needs a dense desktop layout (map + messages panel,
inventory management, admin console). Mobile needs native camera, push, location, deep links.

## Decision
- Web: Angular 22, standalone components, signals, Angular Material (Material 3 theming from
  shared design tokens), strict TypeScript, ESLint, Playwright E2E. Optional prerendering for
  public/legal pages later.
- Mobile: Expo SDK 58 (SDK 57 until the 2026-10-06 amendment below) with expo-router (tabs:
  Map, Inventory, Search, Messages, Wishlist, Profile), react-native-maps,
  expo-camera/location/notifications, TanStack Query, Maestro for E2E. Different layout from
  desktop by design (bottom sheets instead of side panels).
- Both consume the same OpenAPI contract: `packages/api-client` (generated Angular services)
  and `packages/shared-types` (generated TypeScript types + `openapi-fetch`).

## Consequences
- Two UI codebases, one API contract; DTO changes propagate by regeneration, not by hand.
- Shared design tokens (`packages/design-tokens`) keep the two visually consistent.

## Amendment 2026-10-06: Expo SDK 58 (owner decision 2026-10-05)

The owner approved one coordinated upgrade from Expo SDK 57 to SDK 58 (every Expo module, React
Native and React together, `npx expo install expo@^58 --fix`), verified like every mobile stage and
shipped as a single PR; the superseded single-package Dependabot PRs are closed afterwards. Store
Expo Go only runs the newest SDK, and single Expo packages bumped one by one break the SDK's
alignment.

- **Versions:** Expo SDK 58 (`expo` 58.0.6), React Native 0.88 (0.88.0-rc.3, the version SDK 58
  pins), React 19.3.0, expo-router 58, Jest 30 with jest-expo 58 and React Native Testing Library 14
  (`test-renderer` instead of `react-test-renderer`). Node ≥ 22.13 (the repository uses Node 24).
- **Pre-release on the day of the upgrade:** SDK 58 is still published under npm's `next` tag and
  pins a React Native release candidate. Until React Native 0.88.0 is stable, the root
  `package.json` overrides `react-native` to that release candidate, because npm does not match a
  prerelease against the peer ranges of react-native-maps, reanimated, worklets, netinfo and Testing
  Library. When SDK 58 is stable: rerun `npx expo install expo@^58 --fix`, drop the override, bump
  `@react-native/jest-preset` with React Native and re-check `expo.install.exclude` (jest, whose
  SDK 58 entry in Expo's versions API still says 29 while jest-expo 58 needs 30).
- **React Native's strict TypeScript API** (default since 0.87): component style props are typed
  with `ViewStyleProp` (`apps/mobile/src/theme/styleTypes.ts`), refs with React Native's
  `*Instance` types; no deep `react-native/Libraries` imports.
- **Unchanged:** the New Architecture, edge-to-edge Android, the Leaflet fallback in Expo Go
  (ADR 0010), the privacy rules of ADR 0004, free and local verification only (Expo Go installed by
  Expo CLI on the emulator; no EAS). AsyncStorage stays on 2.x (SDK 58 still pins 2.2.0).
