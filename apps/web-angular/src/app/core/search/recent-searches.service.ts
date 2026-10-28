import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';

/** At most this many recent searches (the phone's RECENT_SEARCHES_MAX). */
export const RECENT_SEARCHES_MAX = 8;
/** Longest text kept (the search field's own limit). */
export const RECENT_SEARCH_MAX_LENGTH = 100;
export const RECENT_SEARCHES_STORAGE_KEY = 'orenji.recent-searches.v1';
/** The visitor without an account keeps their own list. */
const GUEST = 'guest';

interface Stored {
  byUser: Record<string, string[]>;
  /** Accounts (and the guest) that turned "Remember my searches" off in this browser. */
  forgetting: Record<string, true>;
}

/** The list after recording `query`: moved to the front, case-insensitive duplicates removed. */
export function rememberSearch(list: readonly string[], query: string): string[] {
  const value = query.trim().slice(0, RECENT_SEARCH_MAX_LENGTH);
  if (value.length < 2) {
    return [...list];
  }
  const lower = value.toLowerCase();
  return [value, ...list.filter((entry) => entry.toLowerCase() !== lower)].slice(
    0,
    RECENT_SEARCHES_MAX,
  );
}

function parse(raw: string | null): Stored {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
    const byUser: Record<string, string[]> = {};
    for (const [uid, list] of Object.entries(value?.byUser ?? {})) {
      if (Array.isArray(list)) {
        byUser[uid] = list
          .filter((entry): entry is string => typeof entry === 'string')
          .slice(0, RECENT_SEARCHES_MAX);
      }
    }
    const forgetting: Record<string, true> = {};
    for (const uid of Object.keys(value?.forgetting ?? {})) {
      forgetting[uid] = true;
    }
    return { byUser, forgetting };
  } catch {
    return { byUser: {}, forgetting: {} };
  }
}

/**
 * Recent searches of the top bar's search (spec 4.4): in this browser only (localStorage, every
 * access wrapped), per account, newest first, at most eight. They are never sent to the server or
 * to analytics. Settings › Privacy › "Remember my searches" (on by default) clears them and stops
 * them while it is off. Only search texts are stored, never a place.
 */
@Injectable({ providedIn: 'root' })
export class RecentSearches {
  private readonly auth = inject(AuthService);
  private readonly storage = this.resolveStorage();
  private readonly state = signal<Stored>(this.read());

  private readonly uid = computed(() => this.auth.user()?.uid ?? GUEST);
  readonly list = computed(() => this.state().byUser[this.uid()] ?? []);
  readonly remembering = computed(() => !this.state().forgetting[this.uid()]);

  remember(query: string): void {
    const uid = this.uid();
    if (this.state().forgetting[uid]) {
      return;
    }
    this.write({
      ...this.state(),
      byUser: { ...this.state().byUser, [uid]: rememberSearch(this.list(), query) },
    });
  }

  forget(query: string): void {
    const uid = this.uid();
    this.write({
      ...this.state(),
      byUser: { ...this.state().byUser, [uid]: this.list().filter((entry) => entry !== query) },
    });
  }

  clear(): void {
    const byUser = { ...this.state().byUser };
    delete byUser[this.uid()];
    this.write({ ...this.state(), byUser });
  }

  /** "Remember my searches": off clears the list and stops it until it is on again. */
  setRemembering(on: boolean): void {
    const uid = this.uid();
    const byUser = { ...this.state().byUser };
    const forgetting = { ...this.state().forgetting };
    if (on) {
      delete forgetting[uid];
      this.write({ byUser, forgetting });
    } else {
      delete byUser[uid];
      this.write({ byUser, forgetting: { ...forgetting, [uid]: true } });
    }
  }

  private write(next: Stored): void {
    this.state.set(next);
    try {
      this.storage?.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Blocked storage: the list lives for this visit only.
    }
  }

  private read(): Stored {
    try {
      return parse(this.storage?.getItem(RECENT_SEARCHES_STORAGE_KEY) ?? null);
    } catch {
      return { byUser: {}, forgetting: {} };
    }
  }

  private resolveStorage(): Storage | null {
    try {
      return inject(DOCUMENT).defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }
}
