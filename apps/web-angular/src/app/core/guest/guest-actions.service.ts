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
 * It belongs to the sign-in it was asked for and to nothing else (WG review U1, P1, F2; the phone's
 * R15 `useGuestEntry`: every other entry forgets it): it is forgotten when the guest leaves the
 * sign-in steps still signed out (the browser's Back, the wordmark), when the account that signed
 * in for it signs out or another account appears, and when the ready account first lands on
 * another page than the one it was asked on. It never waits for a later visit.
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
  /** The account that signed in for the pending action (the first one after the ask). */
  private signedInFor: string | null = null;
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
    // `returnUrl` is never a step page (see `ask`): the same page is never a sign-in step.
    return !!pending && this.settled() && samePage(this.urlState(), pending.returnUrl);
  });

  /** Signed in, the account loaded and usable, the welcome done. */
  private readonly settled = computed(
    () =>
      this.auth.isAuthenticated() &&
      this.session.status() === 'ready' &&
      !this.session.needsOnboarding(),
  );

  /** Starts the runner (the shell calls it once). */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.urlState.set(event.urlAfterRedirects);
        this.review(event.urlAfterRedirects, true);
      });
    this.auth.changes$.subscribe((change) => this.identityChanged(change.user?.uid ?? null));
    effect(
      () => {
        if (!this.ready()) {
          return;
        }
        untracked(() => void this.runPending());
      },
      { injector: this.injector },
    );
    // The account became ready while on a page: another page than the action's forgets it.
    effect(
      () => {
        if (this.settled()) {
          untracked(() => this.review(this.urlState(), false));
        }
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
    // The sign-in's own rule (`safeReturnUrl`): a step page is never a page to come back to.
    const returnUrl = isStepPage(this.router.url) ? '/' : this.router.url;
    const active = this.document.activeElement;
    this.opener =
      opener instanceof HTMLElement
        ? opener
        : active instanceof HTMLElement && active !== this.document.body
          ? active
          : null;
    // Nothing is kept while the dialog is open: only Create account or Sign in keeps the action.
    this.forgetPending();
    this.openingState.set(true);
    let choice: GuestAskChoice;
    try {
      // The dialog and Material's dialog service are lazy: they stay out of the initial bundle.
      const [{ SignInDialogComponent, signInDialogDescription }, { MatDialog }] = await Promise.all(
        [import('./sign-in-dialog.component'), import('@angular/material/dialog')],
      );
      this.openingState.set(false);
      const ref = this.injector
        .get(MatDialog)
        .open<unknown, SignInDialogData, GuestAskChoice>(SignInDialogComponent, {
          data: { action, subject },
          panelClass: 'app-dialog--confirm',
          // "It's free…" and the card or collector, read after the title (WG review A2).
          ariaDescribedBy: signInDialogDescription(subject),
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
    this.pendingState.set({ action, returnUrl });
    this.signedInFor = null;
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
    this.forgetPending();
    return pending.action;
  }

  /** Forgets the pending action ("Not now", the dialog closed, "Not now, keep browsing"). */
  forget(): void {
    this.forgetPending();
    this.opener = null;
  }

  private forgetPending(): void {
    this.pendingState.set(null);
    this.signedInFor = null;
  }

  /**
   * After a navigation (`landing`) or once the account is ready: a guest who left the sign-in
   * steps still signed out gave the action up; a ready account on another page than the action's
   * never comes back for it. The sign-in steps (and an account still loading) keep it.
   */
  private review(url: string, landing: boolean): void {
    const pending = this.pendingState();
    if (!pending || this.running || isStepPage(url)) {
      return;
    }
    if (!this.auth.isAuthenticated()) {
      if (landing) {
        this.forget();
      }
      return;
    }
    if (this.settled() && !samePage(url, pending.returnUrl)) {
      this.forget();
    }
  }

  /** The action finishes only for the account that signed in for it. */
  private identityChanged(uid: string | null): void {
    if (!this.pendingState()) {
      return;
    }
    if (uid === null) {
      // Signed out after signing in for it (Review our terms' Sign out, the account states').
      if (this.signedInFor !== null) {
        this.forget();
      }
      return;
    }
    if (this.signedInFor === null) {
      this.signedInFor = uid;
    } else if (this.signedInFor !== uid) {
      this.forget();
    }
  }

  private async runPending(): Promise<void> {
    const pending = this.pendingState();
    if (!pending || this.running || finishedByPage(pending.action)) {
      return;
    }
    this.running = true;
    this.forgetPending();
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
