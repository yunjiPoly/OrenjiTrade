import { DOCUMENT } from '@angular/common';
import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { SessionService } from '../../core/auth/session.service';

/** Where the trading safety notice is shown; each is dismissed on its own. */
export type SafetyNoticeContext = 'conversation' | 'trade';

export const SAFETY_NOTICE_STORAGE_KEY = 'orenji.safety-notice.v1';

/** Dismissal timestamps (ISO) per context, per user id. */
type DismissalMap = Record<string, Partial<Record<SafetyNoticeContext, string>>>;

/**
 * Remembers which trading safety notices the signed-in collector dismissed. There is no
 * server-side preferences mechanism for this kind of hint (only typed privacy, notification and
 * offer settings), so the dismissal lives in this browser's local storage, keyed by user id so
 * two collectors sharing a browser each see the notice once. Signing in on another device shows
 * it again, which is acceptable for a safety reminder.
 */
@Injectable({ providedIn: 'root' })
export class SafetyNoticeService {
  private readonly document = inject(DOCUMENT);
  private readonly session = inject(SessionService);
  private readonly storage = this.resolveStorage();

  private readonly dismissals = signal<DismissalMap>(this.read());

  /** True once the current collector dismissed the notice of `context`. */
  dismissed(context: SafetyNoticeContext): Signal<boolean> {
    return computed(() => !!this.dismissals()[this.userKey()]?.[context]);
  }

  dismiss(context: SafetyNoticeContext): void {
    const key = this.userKey();
    const next: DismissalMap = {
      ...this.dismissals(),
      [key]: { ...this.dismissals()[key], [context]: new Date().toISOString() },
    };
    this.dismissals.set(next);
    try {
      this.storage?.setItem(SAFETY_NOTICE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage may be unavailable (private mode, quota); the in-memory state still works.
    }
  }

  private userKey(): string {
    return this.session.me()?.id ?? 'anonymous';
  }

  private read(): DismissalMap {
    try {
      const raw = this.storage?.getItem(SAFETY_NOTICE_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as DismissalMap)
        : {};
    } catch {
      return {};
    }
  }

  private resolveStorage(): Storage | null {
    try {
      return this.document.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }
}
