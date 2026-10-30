import { DOCUMENT } from '@angular/common';
import { Injectable, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import type { SignInDialogData } from './sign-in-dialog.component';
import {
  GuestAction,
  GuestAskSubject,
  finishedByPage,
  isStepPage,
  samePage,
} from './guest-actions';

/** An action waiting for the sign-in, with the page it was asked on. */
export interface PendingGuestAction {
  action: GuestAction;
  /** The guest's page (path and query): sign-in comes back to it, and the action finishes there. */
  returnUrl: string;
}

/** What the sign-in dialog answers: the step the guest chose, or nothing ("Not now", Esc). */
export type GuestAskChoice = 'sign-up' | 'sign-in' | undefined;

/**
 * Browsing without an account on the web (spec 14, decision 4; the phone's R15): any action that
 * needs an account opens the sign-in dialog (440: its title says what the guest tried, "It's free.
 * When you're done, you come right back here.", [Create account], [Sign in], "Not now"). Create
 * account and Sign in keep the action with the guest's page as `returnUrl`; once the account is
 * ready and the guest is back on that page, the action finishes there (`guest-finish.ts`, or the
 * page itself for its Add drawer). "Not now", Esc and "Not now, keep browsing" forget it.
 *
 * The action is kept in memory for this tab only, by its listing or card (never a collector), as
 * on the phone; the page's address travels as the sign-in's `returnUrl`.
 */
@Injectable({ providedIn: 'root' })
export class GuestActions {
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly document = inject(DOCUMENT);

  private readonly pendingState = signal<PendingGuestAction | null>(null);
  private readonly urlState = signal<string>(this.router.url);
  private readonly openingState = signal(false);
  private started = false;
  private running = false;
  /** The control that asked: the finished action's drawer gives the focus back there. */
  private opener: HTMLElement | null = null;

  readonly pending = this.pendingState.asReadonly();
  /** The dialog's chunk is loading. */
  readonly opening = this.openingState.asReadonly();
  /**
   * The account is ready and the guest is back on the page the action was asked on: a page that
   * finishes its own action (the Add drawer) takes it then.
   */
  readonly ready = computed(() => {
    const pending = this.pendingState();
    const url = this.urlState();
    return (
      !!pending &&
      this.auth.isAuthenticated() &&
      this.session.status() === 'ready' &&
      !this.session.needsOnboarding() &&
      !isStepPage(url) &&
      samePage(url, pending.returnUrl)
    );
  });

  /** Starts the runner (the shell calls it once). */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.urlState.set(event.urlAfterRedirects));
    effect(
      () => {
        if (!this.ready()) {
          return;
        }
        untracked(() => void this.runPending());
      },
      { injector: this.injector },
    );
  }

  /**
   * A guest tried `action`: the sign-in dialog opens (its title says what they tried; `subject`
   * shows the card or "A collector" under it). Resolves what they chose.
   */
  async ask(
    action: GuestAction,
    subject: GuestAskSubject | null = null,
    opener: EventTarget | null = null,
  ): Promise<GuestAskChoice> {
    const returnUrl = this.router.url;
    const active = this.document.activeElement;
    this.opener =
      opener instanceof HTMLElement
        ? opener
        : active instanceof HTMLElement && active !== this.document.body
          ? active
          : null;
    this.pendingState.set({ action, returnUrl });
    this.openingState.set(true);
    let choice: GuestAskChoice;
    try {
      // The dialog and Material's dialog service are lazy: they stay out of the initial bundle.
      const [{ SignInDialogComponent }, { MatDialog }] = await Promise.all([
        import('./sign-in-dialog.component'),
        import('@angular/material/dialog'),
      ]);
      this.openingState.set(false);
      const ref = this.injector
        .get(MatDialog)
        .open<unknown, SignInDialogData, GuestAskChoice>(SignInDialogComponent, {
          data: { action, subject },
          panelClass: 'app-dialog--confirm',
          autoFocus: 'first-tabbable',
          restoreFocus: true,
        });
      choice = await firstValueFrom(ref.afterClosed());
    } finally {
      this.openingState.set(false);
    }
    if (!choice) {
      this.forget();
      return undefined;
    }
    await this.router.navigate([choice === 'sign-up' ? '/auth/sign-up' : '/auth/sign-in'], {
      queryParams: { returnUrl },
    });
    return choice;
  }

  /** The pending action when it is `kind` and `matches`, taken (a page finishing its own). */
  take(matches: (action: GuestAction) => boolean): GuestAction | null {
    const pending = this.pendingState();
    if (!pending || !this.ready() || !matches(pending.action)) {
      return null;
    }
    this.pendingState.set(null);
    return pending.action;
  }

  /** Forgets the pending action ("Not now", the dialog closed, "Not now, keep browsing"). */
  forget(): void {
    this.pendingState.set(null);
    this.opener = null;
  }

  private async runPending(): Promise<void> {
    const pending = this.pendingState();
    if (!pending || this.running || finishedByPage(pending.action)) {
      return;
    }
    this.running = true;
    this.pendingState.set(null);
    const opener = this.opener?.isConnected ? this.opener : null;
    this.opener = null;
    try {
      const { finishGuestAction } = await import('./guest-finish');
      await finishGuestAction(pending.action, this.injector, opener);
    } finally {
      this.running = false;
    }
  }
}
