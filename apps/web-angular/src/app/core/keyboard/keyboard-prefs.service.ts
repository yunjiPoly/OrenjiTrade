import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

/** localStorage key of the single-key shortcuts switch (Settings › Appearance). */
export const SINGLE_KEYS_STORAGE_KEY = 'orenji.shortcuts.single-key';

/**
 * Settings › Appearance › "Single-key shortcuts" (decision 24, WCAG 2.2 SC 2.1.4): on by default,
 * kept in this browser. Off, `/`, `n`, `g` then a letter and `?` do nothing; Ctrl/Cmd+K and
 * Ctrl/Cmd+Enter keep working.
 */
@Injectable({ providedIn: 'root' })
export class KeyboardPrefs {
  private readonly storage = this.resolveStorage();
  private readonly singleKeysState = signal(this.read());

  readonly singleKeys = this.singleKeysState.asReadonly();

  setSingleKeys(on: boolean): void {
    this.singleKeysState.set(on);
    try {
      if (on) {
        this.storage?.removeItem(SINGLE_KEYS_STORAGE_KEY);
      } else {
        this.storage?.setItem(SINGLE_KEYS_STORAGE_KEY, 'off');
      }
    } catch {
      // Storage may be blocked (private window): the switch still works for this visit.
    }
  }

  private read(): boolean {
    try {
      return this.storage?.getItem(SINGLE_KEYS_STORAGE_KEY) !== 'off';
    } catch {
      return true;
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
