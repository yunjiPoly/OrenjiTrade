import { Component, Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { ListingsService } from '@orenji/api-client';
import { of } from 'rxjs';
import { ChatDrawer } from '../../shared/messaging/chat-drawer.service';
import { AuthService } from '../auth/auth.service';
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

  beforeEach(async () => {
    authenticated.set(false);
    status.set('anonymous');
    needsOnboarding.set(false);
    choice = 'sign-in';
    open = vi.fn(() => ({ afterClosed: () => of(choice) }));
    message = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'cards/:id', component: Blank },
          { path: 'auth/sign-in', component: Blank },
          { path: 'auth/sign-up', component: Blank },
          { path: '**', component: Blank },
        ]),
        { provide: MatDialog, useValue: { open } },
        { provide: AuthService, useValue: { isAuthenticated: authenticated } },
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
});
