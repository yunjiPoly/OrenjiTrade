import { Injectable, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export type ToastTone = 'success' | 'error' | 'info';

/** What a toast says (spec 4.8): a title, a sub-line and at most one teal action. */
export interface ToastInput {
  title: string;
  sub?: string | null;
  /** "View", "Undo"... An action without a handler simply closes the toast. */
  action?: string | null;
  tone?: ToastTone;
  /** Milliseconds; by default 6 s, or 10 s with an Undo. */
  duration?: number;
}

export interface Toast {
  id: number;
  title: string;
  sub: string | null;
  action: string | null;
  tone: ToastTone;
  duration: number;
}

export interface ToastDismissal {
  dismissedByAction: boolean;
}

/** The handle of one toast (the part of `MatSnackBarRef` the app uses). */
export interface ToastRef {
  onAction(): Observable<void>;
  afterDismissed(): Observable<ToastDismissal>;
  dismiss(): void;
}

/** Toasts shown at once; a fourth closes the oldest (spec 4.8). */
export const MAX_TOASTS = 3;
export const TOAST_MS = 6000;
export const UNDO_TOAST_MS = 10000;

interface Entry {
  toast: Toast;
  action$: Subject<void>;
  dismissed$: Subject<ToastDismissal>;
  timer: ReturnType<typeof setTimeout> | null;
  /** When the running timer started, and how long was left then. */
  startedAt: number;
  remaining: number;
}

/** How long a toast stays: 10 s with an Undo, 6 s otherwise, unless the caller says longer. */
export function toastDuration(action: string | null | undefined, requested?: number): number {
  const base = action && /^undo$/i.test(action.trim()) ? UNDO_TOAST_MS : TOAST_MS;
  return requested && requested > base ? requested : base;
}

/**
 * The shell's toasts (spec 4.8): bottom-left beside the rail (above the tab bar below 960),
 * `surfaceElevated`, a check, a title, a sub-line and one teal action; up to three stacked; 6 s,
 * or 10 s with an Undo, paused while the pointer or the focus is on them. Every `MatSnackBar`
 * call of the app lands here (`ToastSnackBar`).
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly entries = new Map<number, Entry>();
  private readonly toastsState = signal<readonly Toast[]>([]);
  readonly toasts = this.toastsState.asReadonly();

  show(input: ToastInput): ToastRef {
    const action = input.action?.trim() || null;
    const toast: Toast = {
      id: this.nextId++,
      title: input.title,
      sub: input.sub?.trim() || null,
      action,
      tone: input.tone ?? 'success',
      duration: toastDuration(action, input.duration),
    };
    const entry: Entry = {
      toast,
      action$: new Subject<void>(),
      dismissed$: new Subject<ToastDismissal>(),
      timer: null,
      startedAt: Date.now(),
      remaining: toast.duration,
    };
    this.entries.set(toast.id, entry);
    this.toastsState.update((list) => [...list, toast]);
    while (this.toastsState().length > MAX_TOASTS) {
      this.close(this.toastsState()[0].id, false);
    }
    this.run(entry);
    return {
      onAction: () => entry.action$.asObservable(),
      afterDismissed: () => entry.dismissed$.asObservable(),
      dismiss: () => this.close(toast.id, false),
    };
  }

  /** The toast's action was used: it fires, then the toast closes. */
  act(id: number): void {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }
    entry.action$.next();
    entry.action$.complete();
    this.close(id, true);
  }

  close(id: number, byAction: boolean): void {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }
    if (entry.timer) {
      clearTimeout(entry.timer);
    }
    this.entries.delete(id);
    this.toastsState.update((list) => list.filter((toast) => toast.id !== id));
    entry.dismissed$.next({ dismissedByAction: byAction });
    entry.dismissed$.complete();
    entry.action$.complete();
  }

  /** The pointer or the focus is on the toasts: every timer waits. */
  pause(): void {
    for (const entry of this.entries.values()) {
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
        entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.startedAt));
      }
    }
  }

  resume(): void {
    for (const entry of this.entries.values()) {
      if (!entry.timer) {
        this.run(entry);
      }
    }
  }

  private run(entry: Entry): void {
    entry.startedAt = Date.now();
    entry.timer = setTimeout(() => this.close(entry.toast.id, false), entry.remaining);
  }
}
