# ADR 0006 — Angular for web, React Native + Expo for mobile

**Status:** Accepted · **Date:** 2026-09-29

## Context
Product requirement (spec §4). Web needs a dense desktop layout (map + messages panel,
inventory management, admin console). Mobile needs native camera, push, location, deep links.

## Decision
- Web: Angular 22, standalone components, signals, Angular Material (Material 3 theming from
  shared design tokens), strict TypeScript, ESLint, Playwright E2E. Optional prerendering for
  public/legal pages later.
- Mobile: Expo SDK 57 with expo-router (tabs: Map, Inventory, Search, Messages, Wishlist,
  Profile), react-native-maps, expo-camera/location/notifications, TanStack Query, Maestro
  for E2E. Different layout from desktop by design (bottom sheets instead of side panels).
- Both consume the same OpenAPI contract: `packages/api-client` (generated Angular services)
  and `packages/shared-types` (generated TypeScript types + `openapi-fetch`).

## Consequences
- Two UI codebases, one API contract; DTO changes propagate by regeneration, not by hand.
- Shared design tokens (`packages/design-tokens`) keep the two visually consistent.
