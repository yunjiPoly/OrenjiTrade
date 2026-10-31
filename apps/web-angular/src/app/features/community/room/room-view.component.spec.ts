import { LiveAnnouncer } from '@angular/cdk/a11y';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AdminCommunityService, CommunityService, PostResponse } from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { ToastService } from '../../../core/feedback/toast.service';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { BlockActionsService } from '../../../shared/messaging/block-actions.service';
import { ChatDrafts } from '../../../shared/messaging/chat-drafts.service';
import { ConversationStarterService } from '../../../shared/messaging/conversation-starter.service';
import { ReportActionsService } from '../../../shared/reports/report-actions.service';
import { RULES_PANE_KEY } from '../data/community-rules';
import { CommunityRoomsStore } from '../data/community-rooms.store';
import { fixturePost, fixtureRoom } from '../testing/community-fixtures';
import { RoomViewComponent } from './room-view.component';

const QUEBEC = {
  regionCode: 'americas-north',
  countryCode: 'CA',
  countryName: 'Canada',
  subdivisionCode: 'CA-QC',
  subdivisionName: 'Quebec',
  label: 'Quebec, Canada',
};

describe('RoomViewComponent (spec 10.7, board W22)', () => {
  let fixture: ComponentFixture<RoomViewComponent>;
  let element: HTMLElement;
  let posts: PostResponse[];
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let blocks: Record<string, ReturnType<typeof vi.fn>>;
  let reports: Record<string, ReturnType<typeof vi.fn>>;
  let starter: Record<string, ReturnType<typeof vi.fn>>;
  let toasts: {
    show: ReturnType<typeof vi.fn>;
    action$: Subject<void>;
    dismissed: string[];
  };
  let announce: ReturnType<typeof vi.fn>;
  let rooms: Record<string, ReturnType<typeof vi.fn>>;
  const medium = signal(false);

  async function render(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [RoomViewComponent],
      providers: [
        provideRouter([]),
        { provide: CommunityService, useValue: api },
        { provide: AdminCommunityService, useValue: {} },
        {
          provide: SessionService,
          useValue: {
            me: signal({ id: 'me' }),
            isModerator: signal(false),
            isAdmin: signal(false),
          },
        },
        { provide: CommunityRoomsStore, useValue: rooms },
        { provide: ShellLayout, useValue: { narrow: signal(false), medium } },
        { provide: BlockActionsService, useValue: blocks },
        { provide: ReportActionsService, useValue: reports },
        { provide: ConversationStarterService, useValue: starter },
        { provide: ToastService, useValue: toasts },
        { provide: LiveAnnouncer, useValue: { announce } },
        { provide: ChatDrafts, useValue: { get: () => '', set: vi.fn() } },
        { provide: AppConfigService, useValue: { apiBaseUrl: () => '' } },
      ],
    });
    fixture = TestBed.createComponent(RoomViewComponent);
    fixture.componentRef.setInput('room', fixtureRoom('yugioh', { name: 'Yu-Gi-Oh!' }));
    fixture.componentRef.setInput('regionName', 'Americas (North)');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  function toggle(): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>('[data-testid="room-rules-toggle"]')!;
  }

  beforeEach(() => {
    localStorage.clear();
    medium.set(false);
    posts = [
      fixturePost('lucas', new Date(2026, 9, 30, 9, 31).toISOString(), {
        author: { id: 'lucas-id', handle: 'lucas.tcg', displayName: 'Lucas' },
        body: 'Sorted my trade binder.',
        place: { ...QUEBEC, subdivisionName: 'Ontario', subdivisionCode: 'CA-ON' },
      }),
      fixturePost('maya', new Date(2026, 9, 30, 9, 12).toISOString(), {
        author: { id: 'maya-id', handle: 'maya_k', displayName: 'Maya' },
        body: 'Who else is building Snake-Eye?',
        place: QUEBEC,
      }),
    ];
    api = {
      listCommunityPosts: vi.fn(() => of({ items: posts, hasMore: false })),
      createCommunityPost: vi.fn(() => of(fixturePost('new', new Date().toISOString()))),
    };
    blocks = { block: vi.fn(async () => true), unblock: vi.fn(async () => true) };
    reports = { report: vi.fn(async () => null) };
    starter = { start: vi.fn(async () => ({ id: 'conv-1' })) };
    toasts = {
      action$: new Subject<void>(),
      dismissed: [],
      show: vi.fn((input: { title: string }) => ({
        onAction: () => toasts.action$.asObservable(),
        dismiss: () => toasts.dismissed.push(input.title),
      })),
    };
    announce = vi.fn(async () => undefined);
    rooms = { markVisited: vi.fn(), setLastPost: vi.fn(), refresh: vi.fn() };
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
    delete (document as unknown as Record<string, unknown>)['visibilityState'];
  });

  /** The view's private steps, as the template calls them. */
  function view(): {
    onPost(draft: { text: string; attachments: [] }): Promise<void>;
    onAction(event: { action: string; post: PostResponse; opener: null }): Promise<void>;
    loadOlder(): Promise<void>;
    unblock(author: { id: string; handle: string }): Promise<void>;
  } {
    return fixture.componentInstance as unknown as ReturnType<typeof view>;
  }

  function handles(): (string | undefined)[] {
    return [...element.querySelectorAll('.post__handle')].map((node) => node.textContent?.trim());
  }

  function duplicate(): HttpErrorResponse {
    return new HttpErrorResponse({
      status: 409,
      error: { errorCode: 'DUPLICATE_POST', message: 'dup', requestId: 'r' },
    });
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  function setVisibility(state: DocumentVisibilityState): void {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  }

  it('reads the room again every 15 s on screen, at once when the tab comes back, never after (WF review F2)', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await render();
    const reads = () => api['listCommunityPosts'].mock.calls.length;
    const start = reads();
    vi.advanceTimersByTime(14_999);
    expect(reads()).toBe(start);
    vi.advanceTimersByTime(1);
    expect(reads()).toBe(start + 1);
    await settle();
    // A hidden tab reads nothing.
    setVisibility('hidden');
    vi.advanceTimersByTime(15_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reads()).toBe(start + 1);
    // Back on screen: at once.
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reads()).toBe(start + 2);
    await settle();
    // Gone: no more reads.
    fixture.destroy();
    vi.advanceTimersByTime(60_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reads()).toBe(start + 2);
  });

  it('a refusal leaves when the text changes, and when another room opens (WF review F4)', async () => {
    await render();
    api['createCommunityPost'].mockReturnValue(throwError(() => duplicate()));
    await view().onPost({ text: 'Hello room', attachments: [] });
    fixture.detectChanges();
    const error = () => element.querySelector('[data-testid="room-post-error"]');
    expect(error()?.textContent).toContain('You already posted this.');
    const field = element.querySelector<HTMLTextAreaElement>('[data-testid="room-field"]')!;
    field.value = 'Hello room, again';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(error()).toBeNull();
    // A network refusal's "Try again" leaves with it: it would post the old text.
    api['createCommunityPost'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 0 })),
    );
    await view().onPost({ text: 'Hello room, again', attachments: [] });
    fixture.detectChanges();
    expect(error()?.querySelector('button')?.textContent).toContain('Try again');
    fixture.componentRef.setInput('room', fixtureRoom('pokemon', { name: 'Pokémon' }));
    fixture.detectChanges();
    await settle();
    expect(error()).toBeNull();
  });

  it('"Try again" posts the binder added after a network refusal, then clears the box (WF review R1-2)', async () => {
    await render();
    const field = element.querySelector<HTMLTextAreaElement>('[data-testid="room-field"]')!;
    field.value = 'Trading my binder';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    api['createCommunityPost'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 0 })),
    );
    element.querySelector('form.rc')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api['createCommunityPost']).toHaveBeenLastCalledWith(
      { slug: 'americas-north-yugioh', createPostRequest: { body: 'Trading my binder' } },
      'body',
      false,
      expect.anything(),
    );
    const error = () => element.querySelector('[data-testid="room-post-error"]');
    expect(error()?.textContent).toContain('Your post was not sent.');
    // The collector adds a binder without touching the text, then tries again.
    fixture.debugElement
      .query((node) => node.name === 'app-room-composer')
      .componentInstance.attach({
        kind: 'binder',
        binder: { binderId: 'b-9', name: 'Yu-Gi-Oh! trade binder', itemCount: 40 },
        deckCore: false,
        price: null,
      });
    fixture.detectChanges();
    api['createCommunityPost'].mockReturnValue(of(fixturePost('new', new Date().toISOString())));
    error()!.querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api['createCommunityPost']).toHaveBeenLastCalledWith(
      {
        slug: 'americas-north-yugioh',
        createPostRequest: { body: 'Trading my binder', binderId: 'b-9' },
      },
      'body',
      false,
      expect.anything(),
    );
    expect(error()).toBeNull();
    expect(field.value).toBe('');
    expect(element.querySelector('.rc__tray')).toBeNull();
  });

  it('the community turned off while open: the rooms list is read again (WF review P2)', async () => {
    await render();
    expect(rooms['refresh']).not.toHaveBeenCalled();
    api['listCommunityPosts'].mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { errorCode: 'FEATURE_DISABLED', message: 'off', requestId: 'r' },
          }),
      ),
    );
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(element.textContent).toContain('The community is closed right now');
    expect(rooms['refresh']).toHaveBeenCalled();
  });

  it('after a block the message box has the focus; Undo reads the room again (WF review)', async () => {
    await render();
    (document.activeElement as HTMLElement | null)?.blur();
    await view().onAction({ action: 'block', post: posts[1], opener: null });
    await settle();
    expect(handles()).toEqual(['lucas.tcg']);
    expect(document.activeElement?.getAttribute('data-testid')).toBe('room-field');
    const reads = api['listCommunityPosts'].mock.calls.length;
    toasts.action$.next();
    await settle();
    expect(api['listCommunityPosts'].mock.calls.length).toBe(reads + 1);
    expect(handles()).toEqual(['maya_k', 'lucas.tcg']);
  });

  it('Unblock in Room rules: the focus to the next Unblock, then the close button; Undo leaves (WF review U7)', async () => {
    await render();
    await view().onAction({ action: 'block', post: posts[1], opener: null });
    await view().onAction({ action: 'block', post: posts[0], opener: null });
    await settle();
    const unblocks = () =>
      [...element.querySelectorAll<HTMLButtonElement>('.rr__unblock')].map((button) =>
        button.getAttribute('aria-label'),
      );
    expect(unblocks()).toEqual(['Unblock maya_k', 'Unblock lucas.tcg']);
    const press = (label: string) => {
      const button = element.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
      button.focus();
      button.click();
    };
    press('Unblock maya_k');
    await settle();
    expect(toasts.dismissed).toEqual(['maya_k is blocked']);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Unblock lucas.tcg');
    press('Unblock lucas.tcg');
    await settle();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('room-rules-close');
    expect(toasts.show).toHaveBeenCalledWith({
      title: 'lucas.tcg is unblocked',
      sub: 'Their posts show again.',
    });
  });

  it('older posts come in quietly, with one summary; the focus to the first one shown (WF review A2, A3)', async () => {
    api['listCommunityPosts'].mockReturnValue(
      of({ items: posts, hasMore: true, nextCursor: 'c1' }),
    );
    await render();
    const older = new Subject<unknown>();
    api['listCommunityPosts'].mockReturnValue(older);
    (document.activeElement as HTMLElement | null)?.blur();
    const pending = view().loadOlder();
    fixture.detectChanges();
    const log = element.querySelector('[role="log"]')!;
    expect(log.getAttribute('aria-live')).toBe('off');
    older.next({
      items: [
        fixturePost('old2', new Date(2026, 9, 29, 9, 0).toISOString(), {
          author: { id: 'theo-id', handle: 'theo', displayName: 'Theo' },
        }),
        fixturePost('old1', new Date(2026, 9, 29, 8, 0).toISOString(), {
          author: { id: 'ana-id', handle: 'ana', displayName: 'Ana' },
        }),
      ],
      hasMore: false,
    });
    older.complete();
    await pending;
    await settle();
    expect(handles()).toEqual(['ana', 'theo', 'maya_k', 'lucas.tcg']);
    expect(announce).toHaveBeenCalledWith('2 older posts shown', 'polite');
    expect(document.activeElement?.textContent?.trim()).toBe('ana');
    expect(log.getAttribute('aria-live')).toBeNull();
  });

  it('after "Try again" the posts are in and the message box has the focus (WF review A2)', async () => {
    api['listCommunityPosts'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    await render();
    api['listCommunityPosts'].mockReturnValue(of({ items: posts, hasMore: false }));
    element.querySelector<HTMLButtonElement>('.error-state__retry')!.click();
    await settle();
    expect(handles()).toEqual(['maya_k', 'lucas.tcg']);
    expect(document.activeElement?.getAttribute('data-testid')).toBe('room-field');
  });

  it('"Skip to the message box" is the first stop past the header (WF review A5)', async () => {
    await render();
    const skip = element.querySelector<HTMLAnchorElement>('[data-testid="room-skip"]')!;
    expect(skip.textContent?.trim()).toBe('Skip to the message box');
    skip.click();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('room-field');
  });

  it('the newest post stays in view when the message box grows (WF review U9)', async () => {
    let resized: () => void = () => undefined;
    const original = window.ResizeObserver;
    window.ResizeObserver = class {
      constructor(callback: () => void) {
        resized = callback;
      }
      readonly observe = vi.fn();
      readonly disconnect = vi.fn();
      readonly unobserve = vi.fn();
    } as unknown as typeof ResizeObserver;
    try {
      await render();
      const body = element.querySelector<HTMLElement>('.room__body')!;
      let top = 0;
      let client = 300;
      Object.defineProperty(body, 'scrollHeight', { configurable: true, get: () => 900 });
      Object.defineProperty(body, 'clientHeight', { configurable: true, get: () => client });
      Object.defineProperty(body, 'scrollTop', {
        configurable: true,
        get: () => top,
        set: (value: number) => (top = value),
      });
      top = 600;
      body.dispatchEvent(new Event('scroll'));
      client = 240;
      resized();
      expect(top).toBe(900);
      // Read further up: the log stays where the collector is.
      top = 100;
      body.dispatchEvent(new Event('scroll'));
      resized();
      expect(top).toBe(100);
    } finally {
      window.ResizeObserver = original;
    }
  });

  it('the header, the banner and the posts read like a chat, the room counting as seen', async () => {
    await render();
    expect(element.querySelector('h2')?.textContent).toBe('Yu-Gi-Oh!');
    expect(element.querySelector('.room__sub')?.textContent).toBe('Americas (North) · public room');
    expect(element.querySelector('.room__banner')?.textContent).toContain(
      'Every collector can read this room. Keep deals and addresses in private chats.',
    );
    const log = element.querySelector('[role="log"]')!;
    expect(log.getAttribute('aria-label')).toBe('Posts in the Yu-Gi-Oh! room');
    const handles = [...log.querySelectorAll('.post__handle')].map((node) =>
      node.textContent?.trim(),
    );
    expect(handles).toEqual(['maya_k', 'lucas.tcg']);
    expect(rooms['markVisited']).toHaveBeenCalledWith('americas-north-yugioh', posts[0].createdAt);
  });

  it('Room rules is the third pane at 1280 and wider: shown, then hidden and remembered', async () => {
    await render();
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    const pane = element.querySelector('[data-testid="room-rules"]')!;
    expect(pane.getAttribute('role')).toBe('complementary');
    expect(pane.textContent).toContain('You can post up to 10 times an hour in each room.');
    expect(pane.textContent).toContain('Your city never appears in a room.');
    toggle().click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="room-rules"]')).toBeNull();
    expect(localStorage.getItem(RULES_PANE_KEY)).toBe('off');
  });

  it('at md Room rules is a drawer that starts closed and closes with Esc', async () => {
    medium.set(true);
    await render();
    expect(element.querySelector('[data-testid="room-rules"]')).toBeNull();
    toggle().click();
    fixture.detectChanges();
    const drawer = element.querySelector('[data-testid="room-rules"]')!;
    expect(drawer.getAttribute('role')).toBe('dialog');
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    drawer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="room-rules"]')).toBeNull();
  });

  it('posts the text and its card; a refusal stays under the box with the text kept', async () => {
    await render();
    const view = fixture.componentInstance as unknown as {
      onPost(draft: { text: string; attachments: [] }): Promise<void>;
    };
    await view.onPost({ text: ' Hello room ', attachments: [] });
    expect(api['createCommunityPost']).toHaveBeenCalledWith(
      { slug: 'americas-north-yugioh', createPostRequest: { body: 'Hello room' } },
      'body',
      false,
      expect.anything(),
    );
    expect(rooms['setLastPost']).toHaveBeenCalled();
    api['createCommunityPost'].mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errorCode: 'DUPLICATE_POST', message: 'dup', requestId: 'r' },
          }),
      ),
    );
    await view.onPost({ text: 'Hello room', attachments: [] });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="room-post-error"]')?.textContent).toContain(
      'You already posted this.',
    );
  });

  it("Block hides the author's posts at once, with Undo in the toast and Unblock in the rules", async () => {
    await render();
    const view = fixture.componentInstance as unknown as {
      onAction(event: { action: string; post: PostResponse; opener: null }): Promise<void>;
    };
    await view.onAction({ action: 'block', post: posts[1], opener: null });
    fixture.detectChanges();
    expect(blocks['block']).toHaveBeenCalledWith(
      { id: 'maya-id', displayName: 'maya_k' },
      expect.objectContaining({ title: 'Block maya_k?', notify: false }),
    );
    const handles = [...element.querySelectorAll('.post__handle')].map((node) =>
      node.textContent?.trim(),
    );
    expect(handles).toEqual(['lucas.tcg']);
    expect(toasts.show).toHaveBeenCalledWith({
      title: 'maya_k is blocked',
      sub: 'Their posts are hidden from you. They are never told.',
      action: 'Undo',
    });
    expect(element.querySelector('[data-testid="room-rules"]')?.textContent).toContain(
      'You blocked maya_k',
    );
    toasts.action$.next();
    await fixture.whenStable();
    expect(blocks['unblock']).toHaveBeenCalledWith(
      { id: 'maya-id', displayName: 'maya_k' },
      { notify: false },
    );
  });

  it('Report this post sends the post with its words; Message opens the chat in Messages', async () => {
    await render();
    const view = fixture.componentInstance as unknown as {
      onAction(event: { action: string; post: PostResponse; opener: null }): Promise<void>;
    };
    await view.onAction({ action: 'report', post: posts[1], opener: null });
    expect(reports['report']).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'maya-id', handle: 'maya_k' }),
      { source: 'POST', postId: 'maya' },
      { meta: 'Quebec · 9:12 AM', text: 'Who else is building Snake-Eye?' },
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await view.onAction({ action: 'message', post: posts[1], opener: null });
    expect(starter['start']).toHaveBeenCalledWith('maya-id');
    expect(navigate).toHaveBeenCalledWith(['/messages', 'conv-1']);
  });
});
