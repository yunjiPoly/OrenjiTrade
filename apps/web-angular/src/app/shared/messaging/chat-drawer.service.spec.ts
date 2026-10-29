import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { ConversationSummary } from '@orenji/api-client';
import { AuthService } from '../../core/auth/auth.service';
import { ShellLayout } from '../../core/layout/shell-layout.service';
import { ChatDrawer } from './chat-drawer.service';
import { ConversationStarterService } from './conversation-starter.service';

const CHAT = { id: 'c1', other: { id: 'u2', handle: 'theo.duels' } } as ConversationSummary;

describe('ChatDrawer (web WC, spec 10.6)', () => {
  let drawer: ChatDrawer;
  let router: Router;
  let start: ReturnType<typeof vi.fn>;
  const narrow = signal(false);
  const signedIn = signal(true);

  beforeEach(() => {
    narrow.set(false);
    signedIn.set(true);
    start = vi.fn(() => Promise.resolve(CHAT));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: ConversationStarterService, useValue: { start } },
        { provide: ShellLayout, useValue: { narrow } },
        { provide: AuthService, useValue: { isAuthenticated: signedIn } },
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
});
