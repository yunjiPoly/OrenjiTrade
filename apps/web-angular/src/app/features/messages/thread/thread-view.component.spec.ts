import { CdkTrapFocus } from '@angular/cdk/a11y';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ConversationParticipantOnlineStatusEnum as Online,
  ConversationSubject,
  ConversationSummary,
  DealsService,
} from '@orenji/api-client';
import { Subject, of } from 'rxjs';
import { ToastService } from '../../../core/feedback/toast.service';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { BlockActionsService } from '../../../shared/messaging/block-actions.service';
import { RatingActionsService } from '../../../shared/ratings/rating-actions.service';
import { ReportActionsService } from '../../../shared/reports/report-actions.service';
import { ThreadStore } from '../data/thread.store';
import { DEAL_PANEL_KEY, ThreadViewComponent } from './thread-view.component';

const SUBJECT = {
  kind: 'CARD',
  id: 'item-1',
  ownerId: 'me',
  name: 'Lantern Fox Spirit',
  sold: false,
  listed: true,
  copies: 2,
} as ConversationSubject;

const CHAT: ConversationSummary = {
  id: 'c1',
  other: { id: 'buyer', handle: 'theo.duels', displayName: 'Theo', onlineStatus: Online.Hidden },
  unreadCount: 0,
  muted: false,
  archived: false,
  createdAt: '2026-10-20T10:00:00Z',
  subject: SUBJECT,
};

/**
 * The chat's hub (web WC): where the deal panel shows and whether it is remembered (spec 10.1),
 * the side sent to the address dialog, the toast's Undo and a live sale (WC review F2, F3, U4,
 * U5). The children are left unrendered (`NO_ERRORS_SCHEMA`): they have their own specs.
 */
describe('ThreadViewComponent (web WC, spec 10.1 to 10.5)', () => {
  let fixture: ComponentFixture<ThreadViewComponent>;
  let element: HTMLElement;
  let store: ReturnType<typeof fakeStore>;
  const narrow = signal(false);
  const medium = signal(false);
  let dialogOpen: ReturnType<typeof vi.fn>;
  let toastShow: ReturnType<typeof vi.fn>;
  let undoSale: ReturnType<typeof vi.fn>;
  let eligibility: ReturnType<typeof vi.fn>;

  function fakeStore() {
    return {
      conversation: signal<ConversationSummary | null>(null),
      messages: signal([]),
      status: signal('ready'),
      error: signal(null),
      hasOlder: signal(false),
      loadingOlder: signal(false),
      sending: signal(false),
      sendError: signal<string | null>(null),
      retryDraft: signal(null),
      messagingBlocked: signal(false),
      otherTyping: signal(false),
      selfId: signal<string | null>('me'),
      refreshed: signal<ConversationSummary | null>(null),
      liveSales: signal(0),
      open: vi.fn((conversation: ConversationSummary) => store.conversation.set(conversation)),
      setVisible: vi.fn(),
      load: vi.fn(),
      send: vi.fn(() => Promise.resolve(true)),
      sendDirect: vi.fn(() => Promise.resolve(null)),
      retry: vi.fn(() => Promise.resolve(null)),
      refreshConversation: vi.fn(() => Promise.resolve(null)),
      dropSale: vi.fn(),
      setMessagingBlocked: vi.fn(),
      userTyping: vi.fn(),
      loadOlder: vi.fn(),
      updateConversation: vi.fn(),
    };
  }

  async function create(conversation: ConversationSummary = CHAT): Promise<void> {
    fixture = TestBed.createComponent(ThreadViewComponent);
    fixture.componentRef.setInput('conversation', conversation);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  function panel(): HTMLElement | null {
    return element.querySelector('#deal-panel');
  }

  async function toggleDeal(): Promise<void> {
    element.querySelector('app-thread-header')!.dispatchEvent(new CustomEvent('dealToggle'));
    await fixture.whenStable();
  }

  function call<T>(name: string, ...args: unknown[]): T {
    return (fixture.componentInstance as unknown as Record<string, (...a: unknown[]) => T>)[name](
      ...args,
    );
  }

  beforeEach(() => {
    localStorage.removeItem(DEAL_PANEL_KEY);
    narrow.set(false);
    medium.set(false);
    store = fakeStore();
    dialogOpen = vi.fn(() => ({ afterClosed: () => of(undefined) }));
    toastShow = vi.fn(() => ({
      onAction: () => new Subject<void>(),
      afterDismissed: () => new Subject(),
      dismiss: vi.fn(),
    }));
    undoSale = vi.fn(() => of({}));
    eligibility = vi.fn(() => Promise.resolve({ interactions: [] }));
    TestBed.configureTestingModule({
      providers: [
        { provide: ShellLayout, useValue: { narrow, medium } },
        { provide: MatDialog, useValue: { open: dialogOpen } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: ToastService, useValue: { show: toastShow } },
        { provide: DealsService, useValue: { undoSale } },
        { provide: BlockActionsService, useValue: {} },
        { provide: ReportActionsService, useValue: {} },
        { provide: RatingActionsService, useValue: { eligibility, rate: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(ThreadViewComponent, {
      set: {
        imports: [CdkTrapFocus],
        schemas: [NO_ERRORS_SCHEMA],
        providers: [{ provide: ThreadStore, useFactory: () => store }],
      },
    });
  });

  afterEach(() => localStorage.removeItem(DEAL_PANEL_KEY));

  it('remembers the deal pane at lg in this browser (spec 10.1; WC review F2)', async () => {
    await create();
    expect(panel()?.getAttribute('role')).toBe('complementary');

    await toggleDeal();
    expect(panel()).toBeNull();
    expect(localStorage.getItem(DEAL_PANEL_KEY)).toBe('off');

    // Another chat view, later: the pane stays closed.
    fixture.destroy();
    await create();
    expect(panel()).toBeNull();
    await toggleDeal();
    expect(panel()).not.toBeNull();
    expect(localStorage.getItem(DEAL_PANEL_KEY)).toBe('on');
  });

  it('at md and below 960 opens the deal panel over the chat, closed at first and never remembered', async () => {
    localStorage.setItem(DEAL_PANEL_KEY, 'on');
    for (const [isNarrow, isMedium] of [
      [false, true],
      [true, false],
    ]) {
      narrow.set(isNarrow);
      medium.set(isMedium);
      await create();
      expect(panel()).toBeNull();
      await toggleDeal();
      expect(panel()?.getAttribute('role')).toBe('dialog');
      expect(panel()?.getAttribute('aria-modal')).toBe('true');
      await toggleDeal();
      expect(panel()).toBeNull();
      expect(localStorage.getItem(DEAL_PANEL_KEY)).toBe('on');
      fixture.destroy();
    }
  });

  it('tells the address dialog the reader’s side (WC review F3)', async () => {
    await create();
    call('onComposerAction', 'address');
    expect(dialogOpen.mock.calls[0][1].data).toMatchObject({
      kind: 'address',
      other: 'theo.duels',
      subject: 'Lantern Fox Spirit',
      side: 'selling',
    });
  });

  it('closes the toast’s Undo once the note’s Undo undid the sale (WC review U4)', async () => {
    const dismiss = vi.fn();
    toastShow.mockReturnValueOnce({
      onAction: () => new Subject<void>(),
      afterDismissed: () => new Subject(),
      dismiss,
    });
    dialogOpen.mockReturnValueOnce({ afterClosed: () => of({ sale: { id: 'sale-1' } }) });
    await create();
    await call<Promise<void>>('markSold');
    expect(toastShow.mock.calls[0][0]).toMatchObject({ title: 'Marked as sold', action: 'Undo' });

    await call<Promise<void>>('undoSale', 'sale-1');
    expect(undoSale).toHaveBeenCalledWith({ id: 'sale-1' }, 'body', false, expect.anything());
    expect(store.dropSale).toHaveBeenCalledWith('sale-1');
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('asks for the rating eligibility again when the other collector’s sale arrives live (WC review U5)', async () => {
    await create({ ...CHAT, subject: { ...SUBJECT, ownerId: 'seller' } });
    await vi.waitFor(() => expect(eligibility).toHaveBeenCalledTimes(1));
    store.liveSales.set(1);
    await fixture.whenStable();
    await vi.waitFor(() => expect(eligibility).toHaveBeenCalledTimes(2));
    expect(eligibility).toHaveBeenLastCalledWith('buyer');
  });

  it('keeps a failed quick reply for the composer’s Try again (WC review F6, U10)', async () => {
    await create();
    await call<Promise<void>>('onQuickReply', 'Got your e-Transfer');
    expect(store.sendDirect).toHaveBeenCalledWith(
      { text: 'Got your e-Transfer', attachment: null },
      true,
    );
    element.querySelector('app-message-composer')!.dispatchEvent(new CustomEvent('retry'));
    expect(store.retry).toHaveBeenCalled();
  });
});
