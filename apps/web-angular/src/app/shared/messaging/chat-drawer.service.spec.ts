import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { ConversationSummary } from '@orenji/api-client';
import { Subject } from 'rxjs';
import { AuthChange, AuthService } from '../../core/auth/auth.service';
import type { AuthUser } from '../../core/auth/firebase-auth.port';
import { ShellLayout } from '../../core/layout/shell-layout.service';
import { ChatDrafts } from './chat-drafts.service';
import { ChatDrawer } from './chat-drawer.service';
import { ConversationStarterService } from './conversation-starter.service';

const CHAT = { id: 'c1', other: { id: 'u2', handle: 'theo.duels' } } as ConversationSummary;

describe('ChatDrawer (web WC, spec 10.6)', () => {
  let drawer: ChatDrawer;
  let router: Router;
  let start: ReturnType<typeof vi.fn>;
  const narrow = signal(false);
  const signedIn = signal(true);
  const user = signal<AuthUser | null>({ uid: 'uid-1' } as AuthUser);
  let changes: Subject<AuthChange>;

  /** Firebase reports another identity (a sign-out here or in another tab, or a sign-in). */
  function identity(uid: string | null): void {
    const next = uid ? ({ uid } as AuthUser) : null;
    user.set(next);
    signedIn.set(!!next);
    changes.next({ user: next, idToken: uid ? `token-${uid}` : null });
  }

  beforeEach(() => {
    narrow.set(false);
    signedIn.set(true);
    user.set({ uid: 'uid-1' } as AuthUser);
    changes = new Subject<AuthChange>();
    start = vi.fn(() => Promise.resolve(CHAT));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: ConversationStarterService, useValue: { start } },
        { provide: ShellLayout, useValue: { narrow } },
        {
          provide: AuthService,
          useValue: { isAuthenticated: signedIn, user, changes$: changes },
        },
      ],
    });
    drawer = TestBed.inject(ChatDrawer);
    router = TestBed.inject(Router);
  });

  it('opens one chat at a time about the listing, and gives the focus back to its opener', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    await drawer.message({ recipientId: 'u2', subjectItemId: 'item-1' }, opener);
    expect(start).toHaveBeenCalledWith('u2', { subjectItemId: 'item-1' });
    expect(drawer.state()?.conversation.id).toBe('c1');

    // Another chat replaces it.
    start.mockResolvedValueOnce({ ...CHAT, id: 'c2' });
    await drawer.message({ recipientId: 'u3', subjectBinderId: 'core-1' });
    expect(start).toHaveBeenLastCalledWith('u3', { subjectBinderId: 'core-1' });
    expect(drawer.state()?.conversation.id).toBe('c2');
    expect(drawer.state()?.opener).toBe(opener);

    vi.useFakeTimers();
    drawer.close();
    vi.runAllTimers();
    vi.useRealTimers();
    expect(drawer.state()).toBeNull();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('goes to /messages/:id below 960, and closes when Messages opens', async () => {
    narrow.set(true);
    const navigate = vi.spyOn(router, 'navigate');
    await drawer.message({ recipientId: 'u2' });
    expect(navigate).toHaveBeenCalledWith(['/messages', 'c1']);
    expect(drawer.state()).toBeNull();

    narrow.set(false);
    await drawer.message({ recipientId: 'u2' });
    expect(drawer.state()).not.toBeNull();
    await router.navigateByUrl('/cards/x');
    expect(drawer.state()).not.toBeNull();
    await router.navigateByUrl('/messages');
    expect(drawer.state()).toBeNull();
  });

  it('asks a guest to sign in first, and opens nothing on a refusal', async () => {
    signedIn.set(false);
    const navigate = vi.spyOn(router, 'navigate');
    await drawer.message({ recipientId: 'u2' });
    expect(start).not.toHaveBeenCalled();
    expect(navigate.mock.calls[0][0]).toEqual(['/auth/sign-in']);

    signedIn.set(true);
    start.mockResolvedValueOnce(null);
    await drawer.message({ recipientId: 'u2' });
    expect(drawer.state()).toBeNull();
  });

  it('closes at once, without moving the focus, when the account signs out or changes (WC review F1, P1)', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    const other = document.createElement('button');
    document.body.append(other);
    await drawer.message({ recipientId: 'u2' }, opener);
    expect(drawer.state()).not.toBeNull();

    // A token refresh of the same account keeps the chat open.
    changes.next({ user: { uid: 'uid-1' } as AuthUser, idToken: 'token-refreshed' });
    expect(drawer.state()).not.toBeNull();

    other.focus();
    vi.useFakeTimers();
    identity(null);
    vi.runAllTimers();
    vi.useRealTimers();
    expect(drawer.state()).toBeNull();
    expect(document.activeElement).toBe(other);

    // Another account signing in on the same tab finds no chat of the previous one.
    identity('uid-2');
    expect(drawer.state()).toBeNull();
    await drawer.message({ recipientId: 'u2' }, opener);
    expect(drawer.state()).not.toBeNull();
    identity('uid-3');
    expect(drawer.state()).toBeNull();
    opener.remove();
    other.remove();
  });

  it('opens nothing when the account changed while the chat was being started', async () => {
    let finish!: (value: ConversationSummary) => void;
    start.mockReturnValueOnce(new Promise<ConversationSummary>((resolve) => (finish = resolve)));
    const opening = drawer.message({ recipientId: 'u2' });
    await vi.waitFor(() => expect(start).toHaveBeenCalled());
    identity(null);
    finish(CHAT);
    await opening;
    expect(drawer.state()).toBeNull();
  });

  it('puts a draft in the message box, never over one already typed, and never sends it (WE)', async () => {
    const drafts = TestBed.inject(ChatDrafts);
    await drawer.message({ recipientId: 'u2', draft: 'Hi! I have Ash Blossom.' });
    expect(start).toHaveBeenLastCalledWith('u2', {});
    expect(drafts.get('c1')).toBe('Hi! I have Ash Blossom.');
    drafts.set('c1', 'My own words');
    await drawer.message({ recipientId: 'u2', draft: 'Hi! I have Ash Blossom.' });
    expect(drafts.get('c1')).toBe('My own words');
  });
});
