import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import {
  AdminCommunityChannel,
  AdminCommunityService,
  UpdateCommunityChannelRequest,
  UpdateCommunityChannelRequestStatusEnum,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { gameInfo } from '../../../shared/domain/games';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { channelIcon } from '../../community/data/community-helpers';
import {
  ChannelFormValue,
  channelKindLabel,
  createChannelRequest,
  updateChannelRequest,
} from './admin-community-labels';
import { ChannelDialogComponent, ChannelDialogData } from './channel-dialog.component';

/**
 * Community channels in the console (`GET /admin/community/channels`, archived ones included):
 * create, edit (name, description, game, city, rate limit, order) and archive or restore. Every
 * change is audited by the API.
 */
@Component({
  selector: 'app-admin-channels',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="channels__bar">
      <p class="admin-muted">
        Region channels are per city and game; topic channels are shared by everyone.
      </p>
      <button matButton="filled" type="button" (click)="create()">
        <mat-icon aria-hidden="true">add</mat-icon>
        New channel
      </button>
    </div>

    @if (error(); as error) {
      <app-error-state
        title="Channels could not load"
        [message]="message(error)"
        [requestId]="error.requestId"
        (retry)="load()"
      />
    } @else if (channels(); as list) {
      @if (list.length === 0) {
        <app-empty-state icon="forum" title="No channels yet" />
      } @else {
        <ul class="channels" aria-label="Community channels">
          @for (channel of list; track channel.id) {
            @let archived = channel.status === 'ARCHIVED';
            <li
              class="channel"
              [class.channel--archived]="archived"
              [attr.data-channel]="channel.slug"
            >
              <span class="channel__icon" aria-hidden="true">
                <mat-icon>{{ icon(channel.kind) }}</mat-icon>
              </span>
              <div class="channel__text">
                <p class="channel__title">
                  <a [routerLink]="['/community', channel.slug]">{{ channel.name }}</a>
                  <span class="channel__status" [attr.data-status]="channel.status">
                    {{ archived ? 'Archived' : 'Active' }}
                  </span>
                </p>
                <p class="channel__meta">
                  <span class="mono">{{ channel.slug }}</span>
                  · {{ kindLabel(channel.kind) }}
                  @if (channel.game) {
                    · {{ gameLabel(channel.game) }}
                  }
                  @if (channel.regionLabel) {
                    · {{ channel.regionLabel }}
                  }
                </p>
                <p class="channel__meta">
                  {{ channel.postRateLimitPerHour }} posts per member per hour ·
                  {{ channel.postCount24h }}
                  {{ channel.postCount24h === 1 ? 'post' : 'posts' }} today
                </p>
              </div>
              <div class="channel__actions">
                <button
                  matIconButton
                  type="button"
                  [attr.aria-label]="'Edit ' + channel.name"
                  matTooltip="Edit"
                  [disabled]="busy() === channel.id"
                  (click)="edit(channel)"
                >
                  <mat-icon>edit</mat-icon>
                </button>
                <button
                  matIconButton
                  type="button"
                  [attr.aria-label]="(archived ? 'Restore ' : 'Archive ') + channel.name"
                  [matTooltip]="archived ? 'Restore' : 'Archive'"
                  [disabled]="busy() === channel.id"
                  (click)="toggleArchived(channel)"
                >
                  <mat-icon>{{ archived ? 'unarchive' : 'archive' }}</mat-icon>
                </button>
              </div>
            </li>
          }
        </ul>
      }
    } @else {
      <div aria-busy="true">
        <span class="visually-hidden">Loading channels</span>
        <app-skeleton variant="list" lines="6" />
      </div>
    }
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .channels__bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-3);
      margin-bottom: var(--spacing-4);
    }
    .channels {
      margin: 0;
      padding: 0;
      list-style: none;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .channel {
      display: flex;
      align-items: center;
      gap: var(--spacing-4);
      padding: var(--spacing-3) var(--spacing-4);
      border-bottom: 1px solid var(--color-border);
    }
    .channel:last-child {
      border-bottom: 0;
    }
    .channel--archived .channel__text {
      opacity: 0.65;
    }
    .channel__icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: var(--radius-md);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
    }
    .channel__text {
      flex: 1 1 auto;
      min-width: 0;
    }
    .channel__title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
      font-weight: var(--font-weight-semibold);
    }
    .channel__title a {
      color: var(--color-ink);
    }
    .channel__status {
      padding: 0 var(--spacing-2);
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--color-success) 18%, var(--color-surface));
      font-size: var(--font-size-xs);
    }
    .channel__status[data-status='ARCHIVED'] {
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
    }
    .channel__meta {
      margin: 2px 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .channel__actions {
      display: flex;
      flex: 0 0 auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminChannelsComponent {
  private readonly api = inject(AdminCommunityService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly channels = signal<AdminCommunityChannel[] | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly kindLabel = channelKindLabel;
  protected readonly icon = channelIcon;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.error.set(null);
    this.channels.set(null);
    this.api.listAdminCommunityChannels('body', false, { context: silentErrors() }).subscribe({
      next: (channels) => this.channels.set(channels ?? []),
      error: (error: unknown) => this.error.set(toApiError(error)),
    });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected gameLabel(slug: string): string {
    return gameInfo(slug).shortLabel;
  }

  protected async create(): Promise<void> {
    const value = await this.openDialog({});
    if (!value) {
      return;
    }
    try {
      const created = await firstValueFrom(
        this.api.createCommunityChannel(
          { createCommunityChannelRequest: createChannelRequest(value) },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.channels.update((channels) => [...(channels ?? []), created]);
      this.snackBar.open(`Channel ${created.name} created.`, 'OK', { duration: 4000 });
    } catch (error) {
      this.snackBar.open(this.refusal(toApiError(error)), 'OK', { duration: 7000 });
    }
  }

  protected async edit(channel: AdminCommunityChannel): Promise<void> {
    const value = await this.openDialog({ channel });
    if (!value) {
      return;
    }
    const request = updateChannelRequest(channel, value);
    if (Object.keys(request).length === 0) {
      return;
    }
    await this.patch(channel, request, `Channel ${value.name.trim()} saved.`);
  }

  protected async toggleArchived(channel: AdminCommunityChannel): Promise<void> {
    const archive = channel.status !== 'ARCHIVED';
    if (archive) {
      const confirmed = await firstValueFrom(
        this.dialog
          .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
            data: {
              title: `Archive ${channel.name}?`,
              message:
                'Members no longer see the channel or its posts. Nothing is deleted; you can ' +
                'restore it later.',
              confirmLabel: 'Archive',
              tone: 'danger',
            },
          })
          .afterClosed(),
      );
      if (!confirmed) {
        return;
      }
    }
    await this.patch(
      channel,
      {
        status: archive
          ? UpdateCommunityChannelRequestStatusEnum.Archived
          : UpdateCommunityChannelRequestStatusEnum.Active,
      },
      archive ? `${channel.name} archived.` : `${channel.name} restored.`,
    );
  }

  private async patch(
    channel: AdminCommunityChannel,
    request: UpdateCommunityChannelRequest,
    confirmation: string,
  ): Promise<void> {
    this.busy.set(channel.id);
    try {
      const updated = await firstValueFrom(
        this.api.updateCommunityChannel(
          { id: channel.id, updateCommunityChannelRequest: request },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.channels.update((channels) =>
        (channels ?? []).map((item) => (item.id === updated.id ? updated : item)),
      );
      this.snackBar.open(confirmation, 'OK', { duration: 4000 });
    } catch (error) {
      this.snackBar.open(this.refusal(toApiError(error)), 'OK', { duration: 7000 });
    } finally {
      this.busy.set(null);
    }
  }

  private refusal(error: ApiError): string {
    if (error.status === 409) {
      return 'A channel with this slug already exists.';
    }
    if (error.errorCode === 'VALIDATION_FAILED' && error.message) {
      return error.message;
    }
    return friendlyMessage(error);
  }

  private openDialog(data: ChannelDialogData): Promise<ChannelFormValue | undefined> {
    return firstValueFrom(
      this.dialog
        .open<ChannelDialogComponent, ChannelDialogData, ChannelFormValue>(ChannelDialogComponent, {
          data,
          width: '600px',
          maxWidth: 'calc(100vw - 32px)',
        })
        .afterClosed(),
    );
  }
}
