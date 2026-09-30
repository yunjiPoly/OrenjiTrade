import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { BlockedUser, BlocksService } from '@orenji/api-client';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { BlockActionsService } from '../../../shared/messaging/block-actions.service';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/ui/section-card/section-card.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; error: ApiError };

/**
 * Settings → Blocked users (`GET /me/blocks`): collectors the caller blocked, with Unblock. Blocked
 * collectors and the caller do not see each other on the map, in search or in the community, and
 * cannot message each other.
 */
@Component({
  selector: 'app-blocked-users-settings',
  imports: [
    MatButtonModule,
    MatIconModule,
    AvatarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    RelativeTimePipe,
    SectionCardComponent,
    SkeletonComponent,
  ],
  template: `
    <app-section-card
      heading="Blocked users"
      headingId="blocked-users-heading"
      description="Blocked collectors cannot message you, and you no longer see each other on the map, in search or in the community. They are never told."
    >
      @switch (state().kind) {
        @case ('loading') {
          <div aria-busy="true">
            <span class="visually-hidden">Loading blocked users</span>
            <app-skeleton variant="list" lines="3" />
          </div>
        }
        @case ('error') {
          <app-error-state
            compact
            title="Blocked users could not load"
            [message]="errorMessage()"
            (retry)="load()"
          />
        }
        @default {
          @if (blocked().length === 0) {
            <app-empty-state
              icon="verified_user"
              title="You have not blocked anyone"
              description="Block a collector from a conversation or a community post when you no longer want to hear from them."
            />
          } @else {
            <ul class="blocked" aria-labelledby="blocked-users-heading">
              @for (user of blocked(); track user.id) {
                <li class="blocked__row">
                  <app-avatar
                    [src]="user.avatarUrl"
                    [name]="user.displayName"
                    [decorative]="true"
                  />
                  <span class="blocked__who">
                    <span class="blocked__name">{{ user.displayName }}</span>
                    <span class="blocked__meta">
                      &#64;{{ user.handle }} · blocked {{ user.blockedAt | relativeTime }}
                    </span>
                  </span>
                  <button
                    matButton="outlined"
                    type="button"
                    [disabled]="busy() === user.id"
                    [attr.aria-label]="'Unblock ' + user.displayName"
                    (click)="unblock(user)"
                  >
                    <mat-icon aria-hidden="true">lock_open</mat-icon>
                    Unblock
                  </button>
                </li>
              }
            </ul>
          }
        }
      }
    </app-section-card>
  `,
  styles: `
    .blocked {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .blocked__row {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-3) 0;
      border-top: 1px solid var(--color-border);
    }
    .blocked__row:first-child {
      border-top: 0;
    }
    .blocked__who {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
    }
    .blocked__name {
      font-weight: var(--font-weight-semibold);
    }
    .blocked__meta {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    @media (max-width: 599px) {
      .blocked__row {
        flex-wrap: wrap;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlockedUsersSettingsComponent {
  private readonly api = inject(BlocksService);
  private readonly blockActions = inject(BlockActionsService);

  protected readonly state = signal<LoadState>({ kind: 'loading' });
  protected readonly blocked = signal<BlockedUser[]>([]);
  protected readonly busy = signal<string | null>(null);
  protected readonly errorMessage = signal('');

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set({ kind: 'loading' });
    this.api.listMyBlocks('body', false, { context: silentErrors() }).subscribe({
      next: (users) => {
        this.blocked.set(users ?? []);
        this.state.set({ kind: 'ready' });
      },
      error: (error: unknown) => {
        const apiError = toApiError(error);
        this.errorMessage.set(friendlyMessage(apiError));
        this.state.set({ kind: 'error', error: apiError });
      },
    });
  }

  protected async unblock(user: BlockedUser): Promise<void> {
    this.busy.set(user.id);
    const done = await this.blockActions.unblock({ id: user.id, displayName: user.displayName });
    this.busy.set(null);
    if (done) {
      this.blocked.update((users) => users.filter((candidate) => candidate.id !== user.id));
    }
  }
}
