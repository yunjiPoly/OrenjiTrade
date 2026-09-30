import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { THEME_PREFERENCES, Theme, ThemePreference, resolveTheme } from '@orenji/design-tokens';

export type { Theme, ThemePreference };

export const THEME_STORAGE_KEY = 'orenji.theme';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Signal-based theme state.
 * - `preference`: what the user chose (`light` | `dark` | `system`), persisted in localStorage.
 * - `resolved`: the effective theme after applying the OS preference for `system`.
 * Applies `html[data-theme]` so both the design tokens (`tokens.css`) and the Material theme
 * (`styles.scss`) switch; `system` removes the attribute and lets `prefers-color-scheme` decide.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly storage = this.resolveStorage();
  private readonly mediaQuery = this.resolveMediaQuery();

  private readonly preferenceState = signal<ThemePreference>(this.readStoredPreference());
  private readonly systemPrefersDark = signal(this.mediaQuery?.matches ?? false);

  readonly preference = this.preferenceState.asReadonly();
  readonly resolved = computed<Theme>(() =>
    resolveTheme(this.preferenceState(), this.systemPrefersDark()),
  );
  readonly isDark = computed(() => this.resolved() === 'dark');

  constructor() {
    if (this.mediaQuery) {
      const listener = (event: MediaQueryListEvent) => this.systemPrefersDark.set(event.matches);
      this.mediaQuery.addEventListener('change', listener);
      this.destroyRef.onDestroy(() => this.mediaQuery?.removeEventListener('change', listener));
    }

    effect(() => this.applyToDocument(this.preferenceState()));
  }

  setPreference(preference: ThemePreference): void {
    this.preferenceState.set(preference);
    try {
      this.storage?.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Storage may be unavailable (private mode, quota); the in-memory state still works.
    }
  }

  /** Flips between light and dark (leaving `system` when the user makes an explicit choice). */
  toggle(): void {
    this.setPreference(this.resolved() === 'dark' ? 'light' : 'dark');
  }

  private applyToDocument(preference: ThemePreference): void {
    const root = this.document.documentElement;
    if (preference === 'system') {
      delete root.dataset['theme'];
    } else {
      root.dataset['theme'] = preference;
    }
  }

  private readStoredPreference(): ThemePreference {
    try {
      const stored = this.storage?.getItem(THEME_STORAGE_KEY);
      return isThemePreference(stored) ? stored : 'system';
    } catch {
      return 'system';
    }
  }

  private resolveStorage(): Storage | null {
    try {
      return this.document.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }

  private resolveMediaQuery(): MediaQueryList | null {
    const view = this.document.defaultView;
    return view && typeof view.matchMedia === 'function' ? view.matchMedia(DARK_MEDIA_QUERY) : null;
  }
}
