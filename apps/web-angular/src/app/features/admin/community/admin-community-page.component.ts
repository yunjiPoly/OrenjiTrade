import { A11yModule } from '@angular/cdk/a11y';
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import {
  AdminCommunityChannel,
  AdminCommunityService,
  AdminModerationService,
  UpdateCommunityChannelRequest,
  UpdateCommunityChannelRequestStatusEnum,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { gameInfo } from '../../../shared/domain/games';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminIconComponent } from '../console/admin-icon.component';
import { runConsoleAction } from '../console/console-actions';
import { gameName } from '../console/console-labels';
import {
  CHANNEL_DESCRIPTION_MAX,
  CHANNEL_NAME_MAX,
  updateChannelRequest,
} from './admin-community-labels';
import {
  ROOM_GAMES,
  RoomCell,
  RoomDraft,
  rateLine,
  roomDraftErrors,
  roomTitle,
  roomsGrid,
  roomsSummary,
} from './community-rooms';

/** The drawer's open room: its place in the grid and its channel. */
interface OpenRoom {
  region: string | null;
  game: string | null;
  channel: AdminCommunityChannel;
}

/**
 * `/admin/community` (spec 15.4, board A5; moderators and admins): the 15 rooms of phone stage
 * R11 as a grid (3 regions x 5 games), each cell with its posts of the last 24 hours, its hourly
 * limit and Open or Archived. A cell opens the room drawer: name, description, posts per member
 * per hour, position, the slug read-only, "Open the room", Archive or Restore, Save. The older
 * channels read under "Archived channels". No "New channel": the apps only list the rooms.
 * Removing posts stays in the room, from the post's menu. The flags live in Flags and rules.
 */
@Component({
  selector: 'app-admin-community-page',
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  imports: [A11yModule, RouterLink, AdminIconComponent, ErrorStateComponent, SkeletonComponent],
  templateUrl: './admin-community-page.component.html',
  styleUrls: [
    '../console/console-page.scss',
    '../console/console-controls.scss',
    './admin-community-page.component.scss',
    './room-drawer.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCommunityPageComponent {
  private readonly api = inject(AdminCommunityService);
  private readonly moderation = inject(AdminModerationService);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);
  private readonly document = inject(DOCUMENT);

  protected readonly channels = signal<AdminCommunityChannel[] | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly communityFlags = signal<number | null>(null);
  protected readonly open = signal<OpenRoom | null>(null);
  protected readonly draft = signal<RoomDraft>({
    name: '',
    description: '',
    postRateLimitPerHour: '',
    sortOrder: '',
  });
  protected readonly tried = signal(false);
  protected readonly busy = signal(false);
  protected readonly archivedOpen = signal(false);
  private opener: HTMLElement | null = null;

  protected readonly games = ROOM_GAMES;
  protected readonly nameMax = CHANNEL_NAME_MAX;
  protected readonly descriptionMax = CHANNEL_DESCRIPTION_MAX;
  protected readonly gameLabel = (slug: string) => gameName(slug) ?? slug;
  protected readonly letter = (slug: string) => gameInfo(slug).letter;
  protected readonly rate = rateLine;

  protected readonly grid = computed(() => roomsGrid(this.channels() ?? []));
  protected readonly summary = computed(() => roomsSummary(this.grid().rows));
  protected readonly errors = computed(() => roomDraftErrors(this.draft()));
  protected readonly shownErrors = computed(() => (this.tried() ? this.errors() : {}));
  protected readonly title = computed(() => {
    const room = this.open();
    if (!room) {
      return '';
    }
    return room.region && room.game ? roomTitle(room.region, room.game) : room.channel.name;
  });

  constructor() {
    void this.load();
    void this.loadFlags();
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      const channels = await firstValueFrom(
        this.api.listAdminCommunityChannels('body', false, { context: silentErrors() }),
      );
      this.channels.set(channels ?? []);
      const room = this.open();
      if (room) {
        const fresh = (channels ?? []).find((channel) => channel.id === room.channel.id);
        if (fresh) {
          this.open.set({ ...room, channel: fresh });
        }
      }
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }

  /** How many open flags are on community posts and replies (the line above the grid). */
  private async loadFlags(): Promise<void> {
    const options = { context: silentErrors() };
    try {
      const [posts, replies] = await Promise.all([
        firstValueFrom(
          this.moderation.listModerationFlags(
            { state: 'OPEN', subjectType: 'COMMUNITY_POST', size: 1 },
            'body',
            false,
            options,
          ),
        ),
        firstValueFrom(
          this.moderation.listModerationFlags(
            { state: 'OPEN', subjectType: 'COMMUNITY_REPLY', size: 1 },
            'body',
            false,
            options,
          ),
        ),
      ]);
      this.communityFlags.set((posts.totalItems ?? 0) + (replies.totalItems ?? 0));
    } catch {
      this.communityFlags.set(null);
    }
  }

  protected cellLabel(cell: RoomCell): string {
    const room = cell.room;
    const title = roomTitle(cell.region, cell.game);
    if (!room) {
      return `${title}: no room yet`;
    }
    const posts = `${room.postCount24h} ${room.postCount24h === 1 ? 'post' : 'posts'} in 24 h`;
    const state = room.status === 'ACTIVE' ? 'Open' : 'Archived';
    return `${title}, ${posts}, ${rateLine(room.postRateLimitPerHour)}, ${state}`;
  }

  protected openCell(cell: RoomCell, event: Event): void {
    if (cell.room) {
      this.openDrawer({ region: cell.region, game: cell.game, channel: cell.room }, event);
    }
  }

  protected openOther(channel: AdminCommunityChannel, event: Event): void {
    this.openDrawer({ region: null, game: null, channel }, event);
  }

  private openDrawer(room: OpenRoom, event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.open.set(room);
    this.tried.set(false);
    this.draft.set({
      name: room.channel.name,
      description: room.channel.description,
      postRateLimitPerHour: String(room.channel.postRateLimitPerHour),
      sortOrder: String(room.channel.sortOrder),
    });
  }

  protected closeDrawer(): void {
    this.open.set(null);
    const opener = this.opener;
    this.opener = null;
    setTimeout(() => opener?.focus());
  }

  /**
   * Esc closes the drawer wherever the focus is (also on the page after a button it held went
   * away), unless a dialog above it took the key first.
   */
  protected onEscape(event: Event): void {
    if (!this.open() || event.defaultPrevented) {
      return;
    }
    if (this.document.querySelector('.cdk-overlay-container [role="dialog"]')) {
      return;
    }
    event.preventDefault();
    this.closeDrawer();
  }

  protected edit(field: keyof RoomDraft, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.draft.update((draft) => ({ ...draft, [field]: value }));
  }

  protected async save(): Promise<void> {
    const room = this.open();
    if (!room || this.busy()) {
      return;
    }
    this.tried.set(true);
    if (Object.keys(this.errors()).length > 0) {
      const first = Object.keys(this.errors())[0];
      this.document.getElementById(`room-${first}`)?.focus();
      return;
    }
    const draft = this.draft();
    const request = updateChannelRequest(room.channel, {
      name: draft.name,
      description: draft.description,
      postRateLimitPerHour: Number(draft.postRateLimitPerHour),
      sortOrder: Number(draft.sortOrder),
      game: room.channel.game ?? '',
      regionLabel: room.channel.regionLabel ?? '',
    });
    if (Object.keys(request).length === 0) {
      this.closeDrawer();
      return;
    }
    if (await this.patch(room.channel, request, `${this.title()} saved.`)) {
      this.closeDrawer();
    }
  }

  protected async toggleArchived(): Promise<void> {
    const room = this.open();
    if (!room || this.busy()) {
      return;
    }
    const archive = room.channel.status !== 'ARCHIVED';
    if (archive) {
      const confirmed = await firstValueFrom(
        this.dialog
          .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
            data: {
              title: `Archive ${this.title()}?`,
              message:
                'Members no longer see the room or its posts. Nothing is deleted; you can ' +
                'restore it later.',
              confirmLabel: 'Archive room',
              tone: 'danger',
            },
          })
          .afterClosed(),
      );
      if (!confirmed) {
        return;
      }
    }
    const done = await this.patch(
      room.channel,
      {
        status: archive
          ? UpdateCommunityChannelRequestStatusEnum.Archived
          : UpdateCommunityChannelRequestStatusEnum.Active,
      },
      archive ? `${this.title()} archived.` : `${this.title()} restored.`,
    );
    if (done) {
      // The button changed (Archive room or Restore room): the focus stays on it.
      setTimeout(() => this.document.getElementById('room-archive-toggle')?.focus());
    }
  }

  private async patch(
    channel: AdminCommunityChannel,
    request: UpdateCommunityChannelRequest,
    success: string,
  ): Promise<boolean> {
    this.busy.set(true);
    const updated = await runConsoleAction(
      this.toasts,
      this.api.updateCommunityChannel(
        { id: channel.id, updateCommunityChannelRequest: request },
        'body',
        false,
        { context: silentErrors() },
      ),
      success,
    );
    this.busy.set(false);
    if (!updated) {
      return false;
    }
    this.channels.update((channels) =>
      (channels ?? []).map((item) => (item.id === updated.id ? updated : item)),
    );
    this.open.update((room) => (room ? { ...room, channel: updated } : room));
    return true;
  }

  protected stateLabel(channel: AdminCommunityChannel): string {
    return channel.status === 'ACTIVE' ? 'Open' : 'Archived';
  }
}
