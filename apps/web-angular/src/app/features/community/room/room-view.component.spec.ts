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
  let toasts: { show: ReturnType<typeof vi.fn>; action$: Subject<void> };
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
        { provide: LiveAnnouncer, useValue: { announce: vi.fn(async () => undefined) } },
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
      show: vi.fn(() => ({ onAction: () => toasts.action$.asObservable() })),
    };
    rooms = { markVisited: vi.fn(), setLastPost: vi.fn(), refresh: vi.fn() };
  });

  afterEach(() => localStorage.clear());

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
