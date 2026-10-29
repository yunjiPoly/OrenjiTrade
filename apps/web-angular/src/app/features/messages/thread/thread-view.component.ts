import { CdkTrapFocus } from '@angular/cdk/a11y';
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import type {
  ConversationSummary,
  RatingEligibilityInteraction,
  SaleResponse,
} from '@orenji/api-client';
import { DealsService } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { ToastService } from '../../../core/feedback/toast.service';
import { BlockActionsService } from '../../../shared/messaging/block-actions.service';
import { RatingActionsService } from '../../../shared/ratings/rating-actions.service';
import { rateableInteractions } from '../../../shared/ratings/rating-labels';
import { ReportActionsService } from '../../../shared/reports/report-actions.service';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { ComposerAction, MessageComposerComponent } from '../composer/message-composer.component';
import {
  CHAT_COPY,
  COMPOSER_COPY,
  MARK_SOLD_COPY,
  SEND_DETAIL_COPY,
  TIP_COPY,
} from '../data/chat-copy';
import { ConversationsStore } from '../data/conversations.store';
import { canUndoSale, chatSide, quickReplies } from '../data/deal-rules';
import { MessageDraft } from '../data/message-draft';
import { saleErrorMessage } from '../data/sale-errors';
import { ThreadStore } from '../data/thread.store';
import { DealPanelComponent } from '../deal/deal-panel.component';
import {
  MarkSoldData,
  MarkSoldDialogComponent,
  MarkSoldResult,
} from '../dialogs/mark-sold-dialog.component';
import {
  SendDetailData,
  SendDetailDialogComponent,
  SendDetailKind,
} from '../dialogs/send-detail-dialog.component';
import {
  ShareChoice,
  SharePickerData,
  SharePickerDialogComponent,
} from '../dialogs/share-picker-dialog.component';
import { MessageListComponent } from './message-list.component';
import { PinnedBarComponent } from './pinned-bar.component';
import { ThreadHeaderComponent, ThreadMenuAction } from './thread-header.component';

/** The deal panel's open state at lg, remembered in this browser (spec 10.1; a convenience). */
export const DEAL_PANEL_KEY = 'orenjitrade.messages.dealPanel';

function readDealPanel(): boolean {
  try {
    return globalThis.localStorage?.getItem(DEAL_PANEL_KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveDealPanel(open: boolean): void {
  try {
    globalThis.localStorage?.setItem(DEAL_PANEL_KEY, open ? 'on' : 'off');
  } catch {
    // Kept for this page only.
  }
}

/**
 * One chat (spec 10.3 to 10.5, boards W18 to W21), on the Messages page (`mode="page"`, with the
 * deal panel: a 320 pane at lg, remembered; a 360 drawer at md opened from "Deal"; a full-screen
 * sheet below 960) or in the chat drawer (`mode="drawer"`, whose own header the drawer draws):
 * the header and its menu, the pinned card or deck core with the seller's Mark as sold, the shield
 * tip of the reader's side, the thread with its sale notes (Undo for 10 minutes, Rate), the quick
 * replies and the composer with its "+" menu. Container of {@link ThreadStore}; the inbox
 * ({@link ConversationsStore}, when there is one) follows mute, archive, block and the pinned
 * card. Every action answers in a toast or in its dialog; refusals read in plain words.
 */
@Component({
  selector: 'app-thread-view',
  imports: [
    CdkTrapFocus,
    MatButtonModule,
    MatIconModule,
    DealPanelComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    MessageComposerComponent,
    MessageListComponent,
    PinnedBarComponent,
    SkeletonComponent,
    ThreadHeaderComponent,
  ],
  providers: [ThreadStore],
  // A click on the scrim closes the deal drawer (Esc and its Close button do too).
  host: { '(click)': 'onHostClick($event)' },
  templateUrl: './thread-view.component.html',
  styleUrl: './thread-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThreadViewComponent {
  protected readonly store = inject(ThreadStore);
  private readonly conversations = inject(ConversationsStore, { optional: true });
  private readonly blocks = inject(BlockActionsService);
  private readonly reports = inject(ReportActionsService);
  private readonly ratings = inject(RatingActionsService);
  private readonly deals = inject(DealsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly toasts = inject(ToastService);
  private readonly layout = inject(ShellLayout);
  private readonly doc = inject(DOCUMENT);
  private readonly composer = viewChild(MessageComposerComponent);

  readonly conversation = input.required<ConversationSummary>();
  /** The thread is on screen (the page tab may be hidden). */
  readonly visible = input(true);
  readonly showBack = input(true);
  /** On the Messages page (with the deal panel) or in the chat drawer. */
  readonly mode = input<'page' | 'drawer'>('page');
  readonly back = output<void>();
  /** The conversation as read again (its pinned card after a pin, a sale or an undo). */
  readonly updated = output<ConversationSummary>();

  protected readonly chat = CHAT_COPY;
  protected readonly composerCopy = COMPOSER_COPY;
  protected readonly c = computed(() => this.store.conversation() ?? this.conversation());

  /** The caller blocked the other collector from this thread. */
  protected readonly blockedByMe = signal(false);
  /** Interactions with the other collector the caller can still rate. */
  protected readonly rateable = signal<RatingEligibilityInteraction[]>([]);
  private eligibilityFor: string | null = null;
  private readonly pageVisible = signal(this.doc.visibilityState !== 'hidden');
  /** The clock of the sale notes' Undo (ticks every 15 s while one is open). */
  protected readonly now = signal(Date.now());

  protected readonly side = computed(() => chatSide(this.c().subject, this.store.selfId()));
  protected readonly cannotSend = computed(
    () =>
      this.blockedByMe() || this.store.messagingBlocked() || this.store.status() === 'unavailable',
  );
  protected readonly placeholder = computed(() =>
    this.cannotSend() ? COMPOSER_COPY.cannotSend : COMPOSER_COPY.placeholder,
  );
  protected readonly replies = computed(() =>
    this.cannotSend()
      ? []
      : quickReplies(
          this.side(),
          this.store.messages(),
          this.store.selfId(),
          this.c().other.id,
          !!this.c().subject?.sold,
        ),
  );
  protected readonly tip = computed(() => TIP_COPY[this.side()]);
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });

  /** Where the deal panel shows: a pane (lg), a drawer (md), a sheet (narrow), or nowhere. */
  protected readonly dealMode = computed<'pane' | 'drawer' | 'sheet' | null>(() => {
    if (this.mode() !== 'page') {
      return null;
    }
    if (this.layout.narrow()) {
      return 'sheet';
    }
    return this.layout.medium() ? 'drawer' : 'pane';
  });
  private readonly dealPane = signal(readDealPanel());
  private readonly dealOverlay = signal(false);
  protected readonly dealOpen = computed(() => {
    const mode = this.dealMode();
    return mode === 'pane' ? this.dealPane() : mode ? this.dealOverlay() : false;
  });
  protected readonly dropping = signal(false);

  constructor() {
    effect(() => {
      const conversation = this.conversation();
      untracked(() => {
        if (this.store.conversation()?.id !== conversation.id) {
          this.blockedByMe.set(false);
          this.dealOverlay.set(false);
        }
        this.store.open(conversation);
        void this.loadEligibility(conversation.other.id);
      });
    });
    effect(() => {
      const visible = this.visible() && this.pageVisible();
      untracked(() => this.store.setVisible(visible));
    });
    effect(() => {
      const fresh = this.store.refreshed();
      if (fresh) {
        untracked(() => {
          this.conversations?.upsert({ ...fresh, unreadCount: 0 });
          this.updated.emit(fresh);
        });
      }
    });
    const onVisibility = () => this.pageVisible.set(this.doc.visibilityState !== 'hidden');
    this.doc.addEventListener('visibilitychange', onVisibility);
    // The Undo of a sale note goes after 10 minutes: the clock ticks while one is open.
    const tick = setInterval(() => {
      const self = this.store.selfId();
      if (this.store.messages().some((message) => canUndoSale(message, self, this.now()))) {
        this.now.set(Date.now());
      }
    }, 15_000);
    inject(DestroyRef).onDestroy(() => {
      this.doc.removeEventListener('visibilitychange', onVisibility);
      clearInterval(tick);
    });
  }

  // --- composer ------------------------------------------------------------------------------

  protected async onSend(draft: MessageDraft): Promise<void> {
    if (await this.store.send(draft)) {
      this.composer()?.reset();
    }
  }

  protected onQuickReply(text: string): void {
    void this.store.sendDirect({ text, attachment: null }, true);
  }

  protected onComposerAction(action: ComposerAction): void {
    switch (action) {
      case 'address':
      case 'etransfer':
        this.openSendDetail(action);
        break;
      case 'card':
      case 'binder':
        void this.openSharePicker(action);
        break;
    }
  }

  /** "More from {seller}": the question goes into the composer, ready to send. */
  protected onAsk(text: string): void {
    if (this.dealMode() !== 'pane') {
      this.dealOverlay.set(false);
    }
    setTimeout(() => this.composer()?.prefill(text));
  }

  protected onDragOver(event: DragEvent): void {
    if (this.cannotSend() || !event.dataTransfer?.types.includes('Files')) {
      return;
    }
    event.preventDefault();
    this.dropping.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
      this.dropping.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    this.dropping.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file || this.cannotSend()) {
      return;
    }
    event.preventDefault();
    this.composer()?.attachFile(file);
  }

  private openSendDetail(kind: SendDetailKind): void {
    const c = this.c();
    const data: SendDetailData = {
      kind,
      other: c.other.handle,
      subject: c.subject?.name ?? null,
      send: (text) => this.store.sendDirect({ text, attachment: null }),
    };
    const ref = this.dialog.open<SendDetailDialogComponent, SendDetailData, boolean>(
      SendDetailDialogComponent,
      { data, panelClass: 'app-dialog--send', ariaLabelledBy: 'send-detail-title' },
    );
    ref.afterClosed().subscribe((sent) => {
      if (sent) {
        this.toasts.show({
          title: kind === 'address' ? SEND_DETAIL_COPY.addressSent : SEND_DETAIL_COPY.etransferSent,
          sub: SEND_DETAIL_COPY.noCopy,
        });
      }
      this.composer()?.focus();
    });
  }

  private async openSharePicker(mode: 'card' | 'binder'): Promise<void> {
    const choice = await firstValueFrom(
      this.dialog
        .open<SharePickerDialogComponent, SharePickerData, ShareChoice>(
          SharePickerDialogComponent,
          {
            data: { mode, other: this.c().other.handle },
            panelClass: 'app-dialog--form',
          },
        )
        .afterClosed(),
    );
    if (!choice) {
      this.composer()?.focus();
      return;
    }
    const problem = await this.store.sendDirect({ text: '', attachment: choice });
    if (problem) {
      this.toasts.show({ title: problem, tone: 'error' });
    }
    this.composer()?.focus();
  }

  // --- deal ----------------------------------------------------------------------------------

  protected onHostClick(event: MouseEvent): void {
    if ((event.target as HTMLElement | null)?.hasAttribute('data-deal-scrim')) {
      this.closeDeal();
    }
  }

  protected toggleDeal(): void {
    if (this.dealMode() === 'pane') {
      const open = !this.dealPane();
      this.dealPane.set(open);
      saveDealPanel(open);
      return;
    }
    this.dealOverlay.update((open) => !open);
  }

  protected closeDeal(): void {
    if (this.dealMode() === 'pane') {
      this.dealPane.set(false);
      saveDealPanel(false);
    } else {
      this.dealOverlay.set(false);
    }
    setTimeout(() => this.doc.querySelector<HTMLElement>('[data-testid="deal-toggle"]')?.focus());
  }

  protected async markSold(): Promise<void> {
    const c = this.c();
    const subject = c.subject;
    if (!subject) {
      return;
    }
    const result = await firstValueFrom(
      this.dialog
        .open<MarkSoldDialogComponent, MarkSoldData, MarkSoldResult>(MarkSoldDialogComponent, {
          data: { conversationId: c.id, subject, buyer: c.other.handle },
          panelClass: 'app-dialog--sold',
        })
        .afterClosed(),
    );
    if (!result) {
      return;
    }
    if ('changed' in result) {
      this.toasts.show({ title: result.message, tone: 'error' });
      void this.store.refreshConversation();
      return;
    }
    void this.store.refreshConversation();
    this.eligibilityFor = null;
    void this.loadEligibility(c.other.id);
    this.offerUndo(result.sale);
  }

  private offerUndo(sale: SaleResponse): void {
    const ref = this.toasts.show({ title: MARK_SOLD_COPY.toast, action: MARK_SOLD_COPY.undo });
    ref.onAction().subscribe(() => void this.undoSale(sale.id));
  }

  protected async undoSale(saleId: string): Promise<void> {
    const handle = this.c().other.handle;
    try {
      await firstValueFrom(
        this.deals.undoSale({ id: saleId }, 'body', false, { context: silentErrors() }),
      );
      this.store.dropSale(saleId);
      this.toasts.show({ title: MARK_SOLD_COPY.undone });
      void this.store.refreshConversation();
      this.eligibilityFor = null;
      void this.loadEligibility(this.c().other.id);
    } catch (error) {
      this.toasts.show({ title: saleErrorMessage(toApiError(error), handle), tone: 'error' });
    }
  }

  // --- the "⋯" menu ----------------------------------------------------------------------------

  protected async onAction(action: ThreadMenuAction): Promise<void> {
    const conversation = this.c();
    const target = { id: conversation.other.id, displayName: conversation.other.handle };
    const collector = {
      id: conversation.other.id,
      displayName: conversation.other.handle,
      handle: conversation.other.handle,
      avatarUrl: conversation.other.avatarUrl,
    };
    switch (action) {
      case 'mute':
      case 'unmute':
        await this.update(
          conversation,
          { muted: action === 'mute' },
          action === 'mute' ? 'Chat muted.' : 'Chat unmuted.',
        );
        break;
      case 'archive':
        if (
          await this.update(
            conversation,
            { archived: true },
            'Chat archived. A new message brings it back.',
          )
        ) {
          this.back.emit();
        }
        break;
      case 'block':
        if (await this.blocks.block(target)) {
          this.blockedByMe.set(true);
          this.store.setMessagingBlocked(true);
          this.conversations?.remove(conversation.id, true);
        }
        break;
      case 'unblock':
        if (await this.blocks.unblock(target)) {
          this.blockedByMe.set(false);
          this.store.setMessagingBlocked(false);
          this.conversations?.upsert(conversation);
          this.store.load();
        }
        break;
      case 'report':
        await this.reports.report(collector, {
          source: 'CONVERSATION',
          conversationId: conversation.id,
        });
        break;
      case 'rate':
        await this.rate();
        break;
    }
  }

  protected async rate(): Promise<void> {
    const conversation = this.c();
    const rated = await this.ratings.rate(
      {
        id: conversation.other.id,
        displayName: conversation.other.handle,
        handle: conversation.other.handle,
        avatarUrl: conversation.other.avatarUrl,
      },
      this.rateable(),
    );
    if (rated) {
      this.eligibilityFor = null;
      await this.loadEligibility(conversation.other.id);
    }
  }

  /** Whether "Rate" is offered: once per collector, silently (nothing is offered on failure). */
  private async loadEligibility(userId: string): Promise<void> {
    if (this.eligibilityFor === userId) {
      return;
    }
    this.eligibilityFor = userId;
    this.rateable.set([]);
    try {
      const eligibility = await this.ratings.eligibility(userId);
      if (this.eligibilityFor === userId) {
        this.rateable.set(rateableInteractions(eligibility));
      }
    } catch {
      // No "Rate" without an answer.
    }
  }

  private async update(
    conversation: ConversationSummary,
    changes: { muted?: boolean; archived?: boolean },
    confirmation: string,
  ): Promise<boolean> {
    try {
      if (this.conversations) {
        await this.conversations.update(conversation.id, changes);
      } else {
        await this.store.updateConversation(changes);
      }
      this.snackBar.open(confirmation, 'OK', { duration: 4000 });
      return true;
    } catch (error) {
      this.snackBar.open(friendlyMessage(toApiError(error)), 'OK', { duration: 6000 });
      return false;
    }
  }
}
