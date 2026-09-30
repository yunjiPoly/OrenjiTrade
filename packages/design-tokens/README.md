# @orenji/design-tokens

Single source of truth for the OrenjiTrade look: colours (light + dark), typography, spacing,
radii, breakpoints, elevation, motion and status colours. Values come from
[`docs/design/design-system.md`](../../docs/design/design-system.md).

```
tokens.json  --(node build.mjs)-->  dist/tokens.css   CSS custom properties
                                    dist/tokens.ts    typed constants + Theme types
```

`dist/` is git-ignored and always regenerated: run `npm run build:tokens` at the repository
root, or rely on the web app's `prebuild` / `prestart` hooks (`apps/web-angular`), which call
this script.

## Build

```bash
npm run build:tokens                        # at the repo root: writes dist/tokens.css and dist/tokens.ts
npm run check -w packages/design-tokens     # CI: fails when dist/ is missing or stale
```

No dependencies; requires Node 20+.

## Consuming

### Web (Angular)

`apps/web-angular/src/styles.scss` imports the CSS file by relative path:

```scss
@import '../../../packages/design-tokens/dist/tokens.css';
```

Custom properties are then available everywhere:

```scss
.wordmark { color: var(--color-primary); font-family: var(--font-display); }
.badge--fresh { color: var(--color-status-fresh); }
```

### Mobile (React Native)

Import the TypeScript module (values are plain numbers / strings; `font.*.mobile` gives the
loaded font family name):

```ts
import { colorsFor, spacing, fonts } from '@orenji/design-tokens';
const c = colorsFor('dark');
```

## CSS variable naming

`--<group>-<path>`, kebab-cased. Colour tokens omit the theme key:

| tokens.json path                       | CSS variable                              |
| -------------------------------------- | ----------------------------------------- |
| `color.light.primary`                  | `--color-primary`                         |
| `color.light.status.fresh`             | `--color-status-fresh`                    |
| `color.light.availability.tradeOrSale` | `--color-availability-trade-or-sale`      |
| `font.display.web`                     | `--font-display`                          |
| `fontSize.md`                          | `--font-size-md` (`16px`)                 |
| `spacing.4`                            | `--spacing-4` (`16px`)                    |
| `radius.pill`                          | `--radius-pill` (`999px`)                 |
| `breakpoint.md`                        | `--breakpoint-md` (`960px`)               |
| `focus.width`                          | `--focus-width` (`2px`)                   |

## Theming

`tokens.css` defines light values on `:root`, dark values on `[data-theme="dark"]`, and dark
values again under `@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"])`.
So:

- no attribute -> follows the OS preference,
- `<html data-theme="light">` -> forced light,
- `<html data-theme="dark">` -> forced dark.

The web `ThemeService` sets that attribute; mobile uses `resolveTheme(preference, prefersDark)`.

## Editing tokens

1. Change `tokens.json` (keep hex colours upper-case, pixel values as plain numbers).
2. `npm run build`.
3. Check contrast (WCAG 2.2 AA, 4.5:1 for text) before changing text/surface pairs.
4. Update `docs/design/design-system.md` if the scale or naming changes.
