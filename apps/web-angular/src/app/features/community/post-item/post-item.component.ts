import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import type { PostResponse, ReplyResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SharedLinkCardComponent } from '../../../shared/links/shared-link-card.component';
import { BlockActionsService } from '../../../shared/messaging/block-actions.service';
import { ReportActionsService } from '../../../shared/reports/report-actions.service';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { POST_MAX_LENGTH } from '../data/community-helpers';
import { CommunityStore } from '../data/community.store';
import { PostRepliesComponent } from '../post-replies/post-replies.component';
import {
  RemoveContentDialogComponent,
  RemoveContentDialogData,
} from '../remove-dialog/remove-content-dialog.component';

/**
 * One post of the feed: author, time, text, shared card/binder, reply toggle and the post menu
 * (edit and delete for the author, remove for moderators, block and report the author). Editing happens in place; replies open inline.
 */
@Component({
  selector: 'app-post-item',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    AvatarComponent,
    PostRepliesComponent,
    RelativeTimePipe,
    SharedLinkCardComponent,
  ],
  templateUrl: './post-item.component.html',
  styleUrl: './post-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostItemComponent {
  protected readonly store = inject(CommunityStore);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly blocks = inject(BlockActionsService);
  private readonly reports = inject(ReportActionsService);
  private readonly repliesView = viewChild(PostRepliesComponent);

  readonly post = input.required<PostResponse>();

  protected readonly own = computed(() => this.post().author.id === this.store.selfId());
  protected readonly canModerate = computed(() => this.store.isModerator() && !this.own());
  protected readonly thread = computed(() => this.store.replies()[this.post().id]);
  protected readonly repliesOpen = signal(false);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly maxLength = POST_MAX_LENGTH;
  protected readonly editText = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(POST_MAX_LENGTH)],
  });
  protected readonly titleId = `post-${Math.random().toString(36).slice(2, 8)}`;

  protected toggleReplies(): void {
    const open = !this.repliesOpen();
    this.repliesOpen.set(open);
    if (open) {
      void this.store.loadReplies(this.post().id);
    }
  }

  protected startEdit(): void {
    this.editText.setValue(this.post().body);
    this.editError.set(null);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
    this.editError.set(null);
  }

  protected async saveEdit(event?: Event): Promise<void> {
    event?.preventDefault();
    const body = this.editText.value.trim();
    if (!body || this.editText.invalid) {
      this.editText.markAsTouched();
      return;
    }
    if (body === this.post().body) {
      this.cancelEdit();
      return;
    }
    this.saving.set(true);
    const problem = await this.store.updatePost(this.post().id, body);
    this.saving.set(false);
    if (problem) {
      this.editError.set(problem);
      return;
    }
    this.editing.set(false);
    this.snackBar.open('Post updated.', 'OK', { duration: 4000 });
  }

  protected async delete(): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: 'Delete this post?',
            message: 'The post and its replies disappear from the channel.',
            confirmLabel: 'Delete',
            tone: 'danger',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }
    const problem = await this.store.deletePost(this.post().id);
    this.snackBar.open(problem ?? 'Post deleted.', 'OK', { duration: 5000 });
  }

  protected async remove(): Promise<void> {
    const reason = await this.askReason('post', this.post().author.displayName);
    if (!reason) {
      return;
    }
    const problem = await this.store.removePost(this.post().id, reason);
    this.snackBar.open(problem ?? 'Post removed. The action is in the audit log.', 'OK', {
      duration: 5000,
    });
  }

  protected async blockAuthor(): Promise<void> {
    const author = this.post().author;
    if (await this.blocks.block({ id: author.id, displayName: author.displayName })) {
      this.store.hideAuthor(author.id);
    }
  }

  /** "Report collector": the post author, with the POST context. */
  protected async reportAuthor(): Promise<void> {
    const post = this.post();
    await this.reports.report(
      {
        id: post.author.id,
        displayName: post.author.displayName,
        handle: post.author.handle,
        avatarUrl: post.author.avatarUrl,
      },
      { source: 'POST', postId: post.id },
    );
  }

  protected async reply(body: string): Promise<void> {
    const problem = await this.store.createReply(this.post().id, body);
    if (!problem) {
      this.repliesView()?.reset();
    }
  }

  protected async deleteReply(reply: ReplyResponse): Promise<void> {
    const problem = await this.store.deleteReply(this.post().id, reply.id);
    this.snackBar.open(problem ?? 'Reply deleted.', 'OK', { duration: 4000 });
  }

  protected async removeReply(reply: ReplyResponse): Promise<void> {
    const reason = await this.askReason('reply', reply.author.displayName);
    if (!reason) {
      return;
    }
    const problem = await this.store.deleteReply(this.post().id, reply.id, reason);
    this.snackBar.open(problem ?? 'Reply removed.', 'OK', { duration: 4000 });
  }

  private askReason(subject: string, authorName: string): Promise<string | undefined> {
    return firstValueFrom(
      this.dialog
        .open<RemoveContentDialogComponent, RemoveContentDialogData, string>(
          RemoveContentDialogComponent,
          { data: { subject, authorName }, width: '480px' },
        )
        .afterClosed(),
    );
  }
}
