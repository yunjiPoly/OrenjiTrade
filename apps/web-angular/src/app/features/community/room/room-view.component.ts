import { LiveAnnouncer } from '@angular/cdk/a11y';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import type { CommunityChannel, PostResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/feedback/toast.service';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { BlockActionsService } from '../../../shared/messaging/block-actions.service';
import { ConversationStarterService } from '../../../shared/messaging/conversation-starter.service';
import { ReportActionsService } from '../../../shared/reports/report-actions.service';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import {
  RoomShareChoice,
  SharePickerData,
  SharePickerDialogComponent,
} from '../../messages/dialogs/share-picker-dialog.component';
import { ROOM_BLOCK_COPY, ROOM_COMPOSER_COPY, ROOM_COPY } from '../data/community-copy';
import { CommunityRoomsStore } from '../data/community-rooms.store';
import {
  ROOM_POLL_MS,
  buildRoomItems,
  postPlace,
  postRequest,
  postTime,
  readRulesPane,
  saveRulesPane,
  toLastPost,
} from '../data/community-rules';
import { PostRefusal, RoomStore } from '../data/room.store';
import {
  RemoveContentDialogComponent,
  RemoveContentDialogData,
} from '../remove-dialog/remove-content-dialog.component';
import { PhotoViewerData, PhotoViewerDialogComponent } from './photo-viewer-dialog.component';
import { RoomComposerComponent, RoomDraft } from './room-composer.component';
import { PostActionEvent, RoomPostComponent } from './room-post.component';
import { BlockedAuthor, RoomRulesComponent } from './room-rules.component';

/** Where Room rules shows: a pane (1280 and wider), a drawer (md) or a sheet (below 960). */
export type RulesMode = 'pane' | 'drawer' | 'sheet';

/**
 * One community room in the chat column (spec 10.7, board W22): the header ("Yu-Gi-Oh!" /
 * "Americas (North) · public room", "Room rules"), the banner, the posts read like a chat (newest
 * at the bottom, day separators, older posts on request, the first page read again every 15 s
 * while on screen), the message box, and Room rules as the third pane at 1280 and wider
 * (remembered in this browser), a 360 drawer at md and a sheet below 960. The "⋯" of a post:
 * "Message {h}" opens the private chat in Messages, "Report this post" the report dialog with
 * the post, "Block {h}" a confirmation, then the author's posts leave the room at once (Undo in
 * the toast). Container of {@link RoomStore}.
 */
@Component({
  selector: 'app-room-view',
  imports: [
    CdkTrapFocus,
    EmptyStateComponent,
    ErrorStateComponent,
    GameMonogramComponent,
    RoomComposerComponent,
    RoomPostComponent,
    RoomRulesComponent,
    ShellIconComponent,
    SkeletonComponent,
  ],
  providers: [RoomStore],
  host: { '(click)': 'onHostClick($event)' },
  templateUrl: './room-view.component.html',
  styleUrl: './room-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomViewComponent {
  protected readonly store = inject(RoomStore);
  private readonly rooms = inject(CommunityRoomsStore);
  private readonly layout = inject(ShellLayout);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);
  private readonly blocks = inject(BlockActionsService);
  private readonly reports = inject(ReportActionsService);
  private readonly starter = inject(ConversationStarterService);
  private readonly router = inject(Router);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly composer = viewChild(RoomComposerComponent);
  private readonly postViews = viewChildren(RoomPostComponent);

  readonly room = input.required<CommunityChannel>();
  /** "Americas (North)". */
  readonly regionName = input.required<string>();
  /** Below 960 the room is its own pane, with Back to the rooms. */
  readonly showBack = input(false);
  readonly back = output<void>();

  protected readonly copy = ROOM_COPY;
  protected readonly headingId = `room-title-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly rulesTitleId = `${this.headingId}-rules`;
  protected readonly items = computed(() => buildRoomItems(this.store.posts(), this.now()));
  protected readonly now = signal(new Date());
  protected readonly refusal = signal<PostRefusal | null>(null);
  protected readonly blocked = signal<BlockedAuthor[]>([]);
  private lastDraft: RoomDraft | null = null;
  private scrolledFor: string | null = null;

  protected readonly rulesMode = computed<RulesMode>(() =>
    this.layout.narrow() ? 'sheet' : this.layout.medium() ? 'drawer' : 'pane',
  );
  private readonly rulesPane = signal(readRulesPane(this.storage()));
  private readonly rulesOverlay = signal(false);
  protected readonly rulesOpen = computed(() =>
    this.rulesMode() === 'pane' ? this.rulesPane() : this.rulesOverlay(),
  );

  constructor() {
    effect(() => {
      const slug = this.room().slug;
      untracked(() => {
        if (this.store.slug() !== slug) {
          this.refusal.set(null);
          this.rulesOverlay.set(false);
          this.lastDraft = null;
        }
        this.store.open(slug);
      });
    });
    // Once a room's posts are in: the newest at the bottom is in view, the room counts as seen.
    effect(() => {
      const status = this.store.status();
      const slug = this.store.slug();
      const posts = this.store.posts();
      untracked(() => {
        if (status !== 'ready' || !slug) {
          return;
        }
        this.rooms.markVisited(slug, posts[0]?.createdAt ?? null);
        if (this.scrolledFor !== slug) {
          this.scrolledFor = slug;
          this.scrollToEnd();
        }
      });
    });
    // Rooms have no push: the open room reads its first page again every 15 s while on screen.
    const poll = setInterval(() => void this.poll(), ROOM_POLL_MS);
    const onVisible = () => {
      if (this.document.visibilityState === 'visible') {
        void this.poll();
      }
    };
    this.document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(poll);
      this.document.removeEventListener('visibilitychange', onVisible);
    });
  }

  /** The focus on the room's first control (Back below 960, else the field). */
  focusStart(): void {
    const back = this.document.querySelector<HTMLElement>('[data-testid="room-back"]');
    if (back) {
      back.focus();
    } else {
      this.composer()?.focus();
    }
  }

  // --- the posts ---------------------------------------------------------------------------

  protected async loadOlder(): Promise<void> {
    const scroller = this.scroller()?.nativeElement;
    const before = scroller ? scroller.scrollHeight - scroller.scrollTop : 0;
    await this.store.loadOlder();
    // The posts already read stay where they were under the older ones.
    afterNextRender(
      () => {
        const element = this.scroller()?.nativeElement;
        if (element) {
          element.scrollTop = element.scrollHeight - before;
        }
      },
      { injector: this.injector },
    );
  }

  private async poll(): Promise<void> {
    if (this.document.visibilityState === 'hidden' || this.store.status() !== 'ready') {
      return;
    }
    const atEnd = this.nearEnd();
    this.now.set(new Date());
    if (await this.store.refresh()) {
      this.syncList();
      if (atEnd) {
        this.scrollToEnd();
      }
    }
  }

  private nearEnd(): boolean {
    const element = this.scroller()?.nativeElement;
    return !element || element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  }

  private scrollToEnd(): void {
    afterNextRender(
      () => {
        const element = this.scroller()?.nativeElement;
        if (element) {
          element.scrollTop = element.scrollHeight;
        }
      },
      { injector: this.injector },
    );
  }

  /** The room list's preview and dot follow what the room shows. */
  private syncList(): void {
    const slug = this.store.slug();
    if (!slug) {
      return;
    }
    const newest = this.store.posts()[0] ?? null;
    this.rooms.setLastPost(slug, toLastPost(newest, this.store.selfId()));
    this.rooms.markVisited(slug, newest?.createdAt ?? null);
  }

  // --- posting -------------------------------------------------------------------------------

  protected async onPost(draft: RoomDraft): Promise<void> {
    this.refusal.set(null);
    this.lastDraft = draft;
    const refusal = await this.store.create(postRequest(draft.text, draft.attachment));
    if (refusal) {
      this.refusal.set(refusal);
      return;
    }
    this.lastDraft = null;
    this.composer()?.reset();
    this.syncList();
    this.scrollToEnd();
    void this.announcer.announce(ROOM_COMPOSER_COPY.posted(this.room().name), 'polite');
  }

  protected retry(): void {
    if (this.lastDraft) {
      void this.onPost(this.lastDraft);
    }
  }

  protected async openShare(mode: 'card' | 'binder'): Promise<void> {
    const room = this.room();
    const choice = await firstValueFrom(
      this.dialog
        .open<SharePickerDialogComponent, SharePickerData, RoomShareChoice>(
          SharePickerDialogComponent,
          {
            data: { mode, other: '', room: { name: room.name, game: room.game ?? null } },
            panelClass: 'app-dialog--form',
          },
        )
        .afterClosed(),
    );
    if (choice) {
      this.composer()?.attach(choice);
    } else {
      this.composer()?.focusPlus();
    }
  }

  // --- the "⋯" of a post -------------------------------------------------------------------

  protected async onAction(event: PostActionEvent): Promise<void> {
    const { action, post } = event;
    switch (action) {
      case 'message':
        await this.message(post);
        return;
      case 'report':
        await this.reports.report(
          {
            id: post.author.id,
            displayName: post.author.displayName,
            handle: post.author.handle,
            avatarUrl: post.author.avatarUrl,
          },
          { source: 'POST', postId: post.id },
          { meta: this.meta(post), text: post.body },
        );
        break;
      case 'block':
        await this.block(post);
        break;
      case 'delete':
        await this.delete(post);
        break;
      case 'remove':
        await this.remove(post);
        break;
    }
    this.afterDialog(post.id);
  }

  protected openPhoto(event: { post: PostResponse; index: number }): void {
    const data: PhotoViewerData = {
      photos: event.post.payload.photos ?? [],
      index: event.index,
      handle: event.post.author.handle,
      meta: this.meta(event.post),
    };
    this.dialog.open<PhotoViewerDialogComponent, PhotoViewerData>(PhotoViewerDialogComponent, {
      data,
      panelClass: 'app-dialog--form',
      ariaLabelledBy: 'photo-viewer-title',
      ariaDescribedBy: 'photo-viewer-sub',
    });
  }

  /** "Quebec · 9:12 AM" (the province only, never a city; the time alone without a place). */
  private meta(post: PostResponse): string {
    return [postPlace(post), postTime(post.createdAt)].filter(Boolean).join(' · ');
  }

  /** "Message {h}": the private chat with the author, in Messages (spec 10.7, board W22). */
  private async message(post: PostResponse): Promise<void> {
    const conversation = await this.starter.start(post.author.id);
    if (conversation) {
      await this.router.navigate(['/messages', conversation.id]);
    }
  }

  private async block(post: PostResponse): Promise<void> {
    const author = { id: post.author.id, handle: post.author.handle };
    const blocked = await this.blocks.block(
      { id: author.id, displayName: author.handle },
      { title: ROOM_BLOCK_COPY.title(author.handle), message: ROOM_BLOCK_COPY.body, notify: false },
    );
    if (!blocked) {
      return;
    }
    this.store.hideAuthor(author.id);
    this.blocked.update((list) => [...list.filter((item) => item.id !== author.id), author]);
    this.syncList();
    this.rooms.refresh();
    const toast = this.toasts.show({
      title: ROOM_BLOCK_COPY.done(author.handle),
      sub: ROOM_BLOCK_COPY.doneSub,
      action: ROOM_BLOCK_COPY.undo,
    });
    toast.onAction().subscribe(() => void this.unblock(author));
  }

  protected async unblock(author: BlockedAuthor): Promise<void> {
    if (
      !(await this.blocks.unblock({ id: author.id, displayName: author.handle }, { notify: false }))
    ) {
      return;
    }
    this.blocked.update((list) => list.filter((item) => item.id !== author.id));
    this.toasts.show({
      title: ROOM_BLOCK_COPY.unblocked(author.handle),
      sub: ROOM_BLOCK_COPY.unblockedSub,
    });
    // Their posts come back: the room and the list are read again.
    this.store.load();
    this.rooms.refresh();
  }

  private async delete(post: PostResponse): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: ROOM_COPY.deleteTitle,
            message: ROOM_COPY.deleteBody,
            confirmLabel: ROOM_COPY.delete,
            tone: 'danger',
          },
          autoFocus: 'dialog',
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }
    const problem = await this.store.delete(post.id);
    this.toasts.show(problem ? { title: problem, tone: 'error' } : { title: ROOM_COPY.deleted });
    if (!problem) {
      this.syncList();
    }
  }

  private async remove(post: PostResponse): Promise<void> {
    const reason = await firstValueFrom(
      this.dialog
        .open<RemoveContentDialogComponent, RemoveContentDialogData, string>(
          RemoveContentDialogComponent,
          { data: { subject: 'post', authorName: post.author.handle }, width: '480px' },
        )
        .afterClosed(),
    );
    if (!reason) {
      return;
    }
    const problem = await this.store.remove(post.id, reason);
    this.toasts.show(problem ? { title: problem, tone: 'error' } : { title: ROOM_COPY.removed });
    if (!problem) {
      this.syncList();
    }
  }

  /**
   * After a dialog opened from "⋯": the focus goes back to that post's "⋯", or to the message box
   * when the post left the room (a block, a delete; WCAG 2.4.3).
   */
  private afterDialog(postId: string): void {
    setTimeout(() => {
      const active = this.document.activeElement;
      if (active && active !== this.document.body && active.isConnected) {
        return;
      }
      const view = this.postViews().find((item) => item.post().id === postId);
      if (!view?.focusMore()) {
        this.composer()?.focus();
      }
    });
  }

  // --- Room rules --------------------------------------------------------------------------

  protected toggleRules(): void {
    if (this.rulesMode() === 'pane') {
      const shown = !this.rulesPane();
      this.rulesPane.set(shown);
      saveRulesPane(this.storage(), shown);
      void this.announcer.announce(shown ? ROOM_COPY.rulesShown : ROOM_COPY.rulesHidden, 'polite');
      return;
    }
    this.rulesOverlay.update((open) => !open);
  }

  protected closeRules(): void {
    if (this.rulesMode() === 'pane') {
      this.rulesPane.set(false);
      saveRulesPane(this.storage(), false);
      void this.announcer.announce(ROOM_COPY.rulesHidden, 'polite');
    } else {
      this.rulesOverlay.set(false);
    }
    setTimeout(() =>
      this.document.querySelector<HTMLElement>('[data-testid="room-rules-toggle"]')?.focus(),
    );
  }

  /** Esc closes the drawer or the sheet (the pane stays). */
  protected onRulesEscape(event: Event): void {
    if (this.rulesMode() === 'pane') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.closeRules();
  }

  protected onHostClick(event: MouseEvent): void {
    if ((event.target as HTMLElement | null)?.hasAttribute('data-rules-scrim')) {
      this.closeRules();
    }
  }

  private storage(): Storage | null {
    try {
      return this.document.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }
}
