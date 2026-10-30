import { Component, Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { ListingsService } from '@orenji/api-client';
import { Subject, of } from 'rxjs';
import { ChatDrawer } from '../../shared/messaging/chat-drawer.service';
import { AuthChange, AuthService } from '../auth/auth.service';
import type { AuthUser } from '../auth/firebase-auth.port';
import { SessionService, SessionStatus } from '../auth/session.service';
import { ToastService } from '../feedback/toast.service';
import { GuestActions } from './guest-actions.service';

@Component({ template: '' })
class Blank {}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    TestBed.tick();
  }
}

describe('GuestActions: the sign-in dialog and the pending action (spec 14)', () => {
  const authenticated = signal(false);
  const status = signal<SessionStatus>('anonymous');
  const needsOnboarding = signal(false);
  let choice: string | undefined;
  let open: ReturnType<typeof vi.fn>;
  let message: ReturnType<typeof vi.fn>;
  let guest: GuestActions;
  let router: Router;
  let changes: Subject<AuthChange>;

  /** Firebase signs `uid` in (or out, `null`): the identity feed, then the auth state. */
  function signIn(uid: string | null): void {
    const user = uid ? ({ uid } as AuthUser) : null;
    authenticated.set(!!uid);
    changes.next({ user, idToken: uid ? `token-${uid}` : null });
  }

  beforeEach(async () => {
    authenticated.set(false);
    status.set('anonymous');
    needsOnboarding.set(false);
    choice = 'sign-in';
    open = vi.fn(() => ({ afterClosed: () => of(choice) }));
    message = vi.fn(async () => undefined);
    changes = new Subject<AuthChange>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'cards/:id', component: Blank },
          { path: 'auth/sign-in', component: Blank },
          { path: 'auth/sign-up', component: Blank },
          { path: 'auth/consent', component: Blank },
          { path: 'onboarding', component: Blank },
          { path: '**', component: Blank },
        ]),
        { provide: MatDialog, useValue: { open } },
        { provide: AuthService, useValue: { isAuthenticated: authenticated, changes$: changes } },
        {
          provide: SessionService,
          useValue: { status, needsOnboarding, me: () => ({ id: 'u-me' }) },
        },
        {
          provide: ListingsService,
          useValue: {
            getListingOwner: vi.fn(() =>
              of({ id: 'u-owner', handle: 'maya_k', displayName: 'Maya' }),
            ),
          },
        },
        { provide: ChatDrawer, useValue: { message } },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    });
    router = TestBed.inject(Router);
    await router.navigateByUrl('/cards/c-1?printing=p-1');
    guest = TestBed.inject(GuestActions);
    guest.start();
  });

  it('opens the dialog, keeps the action and goes to Sign in back to the page', async () => {
    const answer = await guest.ask({ kind: 'message', listing: { itemId: 'i-1' } });
    expect(answer).toBe('sign-in');
    expect(open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: { action: { kind: 'message', listing: { itemId: 'i-1' } }, subject: null },
        panelClass: 'app-dialog--confirm',
      }),
    );
    expect(router.url).toBe('/auth/sign-in?returnUrl=%2Fcards%2Fc-1%3Fprinting%3Dp-1');
    expect(guest.pending()).toEqual({
      action: { kind: 'message', listing: { itemId: 'i-1' } },
      returnUrl: '/cards/c-1?printing=p-1',
    });
  });

  it('"Create account" goes to the sign-up step; "Not now" forgets the action', async () => {
    choice = 'sign-up';
    await guest.ask({ kind: 'wish', cardId: 'c-1' });
    expect(router.url).toBe('/auth/sign-up?returnUrl=%2Fcards%2Fc-1%3Fprinting%3Dp-1');
    await router.navigateByUrl('/cards/c-1?printing=p-1');
    choice = undefined;
    await guest.ask({ kind: 'wish', cardId: 'c-1' });
    expect(guest.pending()).toBeNull();
    expect(router.url).toBe('/cards/c-1?printing=p-1');
  });

  it('finishes the action once signed in, ready and back on its page, and only once', async () => {
    await guest.ask({ kind: 'message', listing: { itemId: 'i-1' } });
    authenticated.set(true);
    status.set('ready');
    await settle();
    // Still on the sign-in step: nothing yet.
    expect(message).not.toHaveBeenCalled();
    needsOnboarding.set(true);
    await router.navigateByUrl('/cards/c-1?printing=p-1');
    await settle();
    // The welcome is not finished: nothing yet.
    expect(message).not.toHaveBeenCalled();
    needsOnboarding.set(false);
    TestBed.tick();
    // The finishing code is a lazy chunk: wait for it.
    await vi.waitFor(() => expect(message).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await settle();
    expect(message).toHaveBeenCalledTimes(1);
    expect(message).toHaveBeenCalledWith({ recipientId: 'u-owner', subjectItemId: 'i-1' }, null);
    expect(guest.pending()).toBeNull();
  });

  it('an action of the page (the Add drawer) waits for the page to take it', async () => {
    await guest.ask({ kind: 'add', cardId: 'c-1' });
    authenticated.set(true);
    status.set('ready');
    await router.navigateByUrl('/cards/c-1?printing=p-1');
    await settle();
    expect(guest.ready()).toBe(true);
    expect(guest.take((action) => action.kind === 'add' && action.cardId === 'c-2')).toBeNull();
    expect(guest.take((action) => action.kind === 'add' && action.cardId === 'c-1')).toEqual({
      kind: 'add',
      cardId: 'c-1',
    });
    expect(guest.pending()).toBeNull();
    expect(TestBed.inject(Injector)).toBeTruthy();
  });

  // WG review U1, P1, F2: the action belongs to the sign-in it was asked for, and to nothing else.
  it('a guest who leaves the sign-in steps still signed out (Back) gives the action up', async () => {
    await guest.ask({ kind: 'message', listing: { itemId: 'i-1' } });
    // Between the sign-in steps it stays.
    await router.navigateByUrl('/auth/sign-up?returnUrl=%2Fcards%2Fc-1%3Fprinting%3Dp-1');
    expect(guest.pending()).not.toBeNull();
    // The browser's Back to the page, still signed out.
    await router.navigateByUrl('/cards/c-1?printing=p-1');
    expect(guest.pending()).toBeNull();
    // A later sign-in from the top bar, on that very page: nothing runs.
    signIn('fb-a');
    status.set('ready');
    await settle();
    expect(guest.ready()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(message).not.toHaveBeenCalled();
  });

  it('signing out after signing in for it, then another account, never finishes it', async () => {
    await guest.ask({ kind: 'message', listing: { itemId: 'i-1' } });
    // A signs in and must review the terms first.
    signIn('fb-a');
    status.set('consent-required');
    await router.navigateByUrl('/auth/consent?returnUrl=%2Fcards%2Fc-1%3Fprinting%3Dp-1');
    expect(guest.pending()).not.toBeNull();
    // Review our terms' Sign out: the action goes with A.
    signIn(null);
    status.set('anonymous');
    expect(guest.pending()).toBeNull();
    // Someone else, back on the card page, signs in from the top bar.
    await router.navigateByUrl('/cards/c-1?printing=p-1');
    signIn('fb-b');
    status.set('ready');
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(message).not.toHaveBeenCalled();
  });

  it('another account appearing in the tab (no sign-out between) forgets it', async () => {
    await guest.ask({ kind: 'message', listing: { itemId: 'i-1' } });
    signIn('fb-a');
    status.set('consent-required');
    await router.navigateByUrl('/auth/consent?returnUrl=%2Fcards%2Fc-1%3Fprinting%3Dp-1');
    // A token refresh of the same account keeps it.
    changes.next({ user: { uid: 'fb-a' } as AuthUser, idToken: 'token-fb-a-2' });
    expect(guest.pending()).not.toBeNull();
    signIn('fb-b');
    expect(guest.pending()).toBeNull();
  });

  it('a ready account on another page never runs it, nor later on its page (no waiting)', async () => {
    await guest.ask({ kind: 'message', listing: { itemId: 'i-1' } });
    signIn('fb-a');
    status.set('ready');
    await settle();
    // On the sign-in step: kept.
    expect(guest.pending()).not.toBeNull();
    // The ready account lands on Home, not on the card page: nothing runs, nothing is taken.
    await router.navigateByUrl('/');
    await settle();
    expect(guest.ready()).toBe(false);
    expect(guest.pending()).toBeNull();
    // Later, back on the card page: still nothing.
    await router.navigateByUrl('/cards/c-1?printing=p-1');
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(message).not.toHaveBeenCalled();
  });

  it('the account becoming ready on another page forgets it; on its page it runs', async () => {
    await guest.ask({ kind: 'message', listing: { itemId: 'i-1' } });
    signIn('fb-a');
    status.set('loading');
    await router.navigateByUrl('/sets/s-1');
    await settle();
    // Still loading: nothing decided yet.
    expect(guest.pending()).not.toBeNull();
    status.set('ready');
    await settle();
    expect(guest.pending()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(message).not.toHaveBeenCalled();

    // The same steps asked on that page: back on it, the page takes it.
    signIn(null);
    status.set('anonymous');
    await guest.ask({ kind: 'add', cardId: 'c-1' });
    expect(router.url).toBe('/auth/sign-in?returnUrl=%2Fsets%2Fs-1');
    signIn('fb-a');
    status.set('loading');
    await router.navigateByUrl('/sets/s-1');
    await settle();
    status.set('ready');
    await settle();
    expect(guest.take((action) => action.kind === 'add')).toEqual({ kind: 'add', cardId: 'c-1' });
  });

  it('keeps nothing while the dialog is open, and never comes back to a step page', async () => {
    const closed = new Subject<string | undefined>();
    open.mockImplementation(() => ({ afterClosed: () => closed }));
    const asked = guest.ask({ kind: 'wish', cardId: 'c-1' });
    await settle();
    expect(guest.pending()).toBeNull();
    closed.next('sign-in');
    closed.complete();
    await asked;
    expect(guest.pending()?.returnUrl).toBe('/cards/c-1?printing=p-1');
  });
});
