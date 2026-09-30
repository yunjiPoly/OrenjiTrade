import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { AdminModerationService, ModerationFlag } from '@orenji/api-client';
import { Subscription, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import {
  FLAG_STATE_FILTERS,
  FlagStateFilter,
  flagReasonLabel,
  flagSubjectLabel,
} from './admin-community-labels';
import { ResolveFlagDialogComponent, ResolveFlagDialogData } from './resolve-flag-dialog.component';

const PAGE_SIZE = 20;

/**
 * Automatic moderation flags (`GET /admin/moderation/flags`, newest first): banned terms,
 * repeated content and unusual posting rates. Moderators review and resolve them; a flag never
 * bans anyone by itself.
 */
@Component({
  selector: 'app-admin-flags',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    EmptyStateComponent,
    ErrorStateComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    <div class="flags__filters" role="group" aria-label="Flag state">
      @for (filter of filters; track filter.value) {
        <button
          type="button"
          class="flags__filter"
          [class.flags__filter--on]="state() === filter.value"
          [attr.aria-pressed]="state() === filter.value"
          (click)="setState(filter.value)"
        >
          {{ filter.label }}
        </button>
      }
    </div>

    @if (error(); as error) {
      <app-error-state
        title="Flags could not load"
        [message]="message(error)"
        [requestId]="error.requestId"
        (retry)="load()"
      />
    } @else if (flags(); as list) {
      @if (list.length === 0) {
        <app-empty-state
          icon="verified"
          [title]="state() === 'OPEN' ? 'No open flags' : 'No flags'"
          description="Flags appear when the automatic rules notice banned terms, repeated content or unusual posting rates."
        />
      } @else {
        <p class="admin-count">{{ total() }} {{ total() === 1 ? 'flag' : 'flags' }}</p>
        <ul class="flags" aria-label="Moderation flags">
          @for (flag of list; track flag.id) {
            @let open = flag.state === 'OPEN';
            <li class="flag" [attr.data-flag]="flag.id">
              <span class="flag__icon" [class.flag__icon--open]="open" aria-hidden="true">
                <mat-icon>{{ open ? 'flag' : 'task_alt' }}</mat-icon>
              </span>
              <div class="flag__text">
                <p class="flag__title">
                  {{ reason(flag.reason) }}
                  <span class="flag__state" [attr.data-state]="flag.state">
                    {{ open ? 'Open' : 'Resolved' }}
                  </span>
                </p>
                <p class="flag__meta">
                  {{ subject(flag.subjectType) }}
                  @if (flag.authorHandle) {
                    by
                    <a [routerLink]="['/collectors', flag.authorHandle]"
                      >&#64;{{ flag.authorHandle }}</a
                    >
                  }
                  ·
                  <time [attr.datetime]="flag.createdAt" [title]="flag.createdAt | date: 'medium'">
                    {{ flag.createdAt | relativeTime }}
                  </time>
                </p>
                @if (!open) {
                  <p class="flag__meta">
                    Resolved
                    @if (flag.resolvedAt) {
                      {{ flag.resolvedAt | relativeTime }}
                    }
                    @if (flag.resolutionNote) {
                      · “{{ flag.resolutionNote }}”
                    }
                  </p>
                }
              </div>
              @if (open) {
                <button
                  matButton="outlined"
                  type="button"
                  [disabled]="busy() === flag.id"
                  [attr.aria-label]="
                    'Resolve flag: ' + reason(flag.reason) + ', ' + subject(flag.subjectType)
                  "
                  (click)="resolve(flag)"
                >
                  Resolve
                </button>
              }
            </li>
          }
        </ul>
        @if (total() > pageSize) {
          <mat-paginator
            [length]="total()"
            [pageIndex]="page()"
            [pageSize]="pageSize"
            [hidePageSize]="true"
            aria-label="Flag pages"
            (page)="onPage($event)"
          />
        }
      }
    } @else {
      <div aria-busy="true">
        <span class="visually-hidden">Loading flags</span>
        <app-skeleton variant="list" lines="5" />
      </div>
    }
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .flags__filters {
      display: flex;
      gap: var(--spacing-1);
      margin-bottom: var(--spacing-4);
    }
    .flags__filter {
      padding: 4px var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-text-muted);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
    }
    .flags__filter--on {
      border-color: var(--color-primary);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
    }
    .flags {
      margin: 0;
      padding: 0;
      list-style: none;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .flag {
      display: flex;
      align-items: center;
      gap: var(--spacing-4);
      padding: var(--spacing-3) var(--spacing-4);
      border-bottom: 1px solid var(--color-border);
    }
    .flag:last-child {
      border-bottom: 0;
    }
    .flag__icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
    }
    .flag__icon--open {
      background: color-mix(in srgb, var(--color-warning) 18%, var(--color-surface));
      color: var(--color-ink);
    }
    .flag__text {
      flex: 1 1 auto;
      min-width: 0;
    }
    .flag__title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
      font-weight: var(--font-weight-semibold);
    }
    .flag__state {
      padding: 0 var(--spacing-2);
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--color-warning) 18%, var(--color-surface));
      font-size: var(--font-size-xs);
    }
    .flag__state[data-state='RESOLVED'] {
      background: color-mix(in srgb, var(--color-success) 18%, var(--color-surface));
    }
    .flag__meta {
      margin: 2px 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    @media (max-width: 599px) {
      .flag {
        flex-wrap: wrap;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminFlagsComponent {
  private readonly api = inject(AdminModerationService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly filters = FLAG_STATE_FILTERS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly state = signal<FlagStateFilter>('OPEN');
  protected readonly page = signal(0);
  protected readonly flags = signal<ModerationFlag[] | null>(null);
  protected readonly total = signal(0);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly reason = flagReasonLabel;
  protected readonly subject = flagSubjectLabel;
  private subscription: Subscription | null = null;

  constructor() {
    this.load();
  }

  protected setState(state: FlagStateFilter): void {
    if (state !== this.state()) {
      this.state.set(state);
      this.page.set(0);
      this.load();
    }
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.load();
  }

  protected load(): void {
    this.subscription?.unsubscribe();
    this.error.set(null);
    this.flags.set(null);
    this.subscription = this.api
      .listModerationFlags(
        { state: this.state(), page: this.page(), size: PAGE_SIZE },
        'body',
        false,
        { context: silentErrors() },
      )
      .subscribe({
        next: (page) => {
          this.flags.set(page.items ?? []);
          this.total.set(page.totalItems ?? page.items?.length ?? 0);
        },
        error: (error: unknown) => this.error.set(toApiError(error)),
      });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected async resolve(flag: ModerationFlag): Promise<void> {
    const subject = `${flagSubjectLabel(flag.subjectType)}${
      flag.authorHandle ? ` by @${flag.authorHandle}` : ''
    }, ${flagReasonLabel(flag.reason).toLowerCase()}`;
    const result = await firstValueFrom(
      this.dialog
        .open<ResolveFlagDialogComponent, ResolveFlagDialogData, { note: string }>(
          ResolveFlagDialogComponent,
          { data: { subject }, width: '480px', maxWidth: 'calc(100vw - 32px)' },
        )
        .afterClosed(),
    );
    if (!result) {
      return;
    }
    this.busy.set(flag.id);
    try {
      const resolved = await firstValueFrom(
        this.api.resolveModerationFlag(
          {
            id: flag.id,
            resolveModerationFlagRequest: result.note ? { note: result.note } : {},
          },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      if (this.state() === 'OPEN') {
        this.flags.update((flags) => (flags ?? []).filter((item) => item.id !== flag.id));
        this.total.update((total) => Math.max(0, total - 1));
      } else {
        this.flags.update((flags) =>
          (flags ?? []).map((item) => (item.id === resolved.id ? resolved : item)),
        );
      }
      this.snackBar.open('Flag resolved. The action is in the audit log.', 'OK', {
        duration: 4000,
      });
    } catch (error) {
      const apiError = toApiError(error);
      this.snackBar.open(
        apiError.status === 409 ? 'This flag was already resolved.' : friendlyMessage(apiError),
        'OK',
        { duration: 6000 },
      );
      if (apiError.status === 409) {
        this.load();
      }
    } finally {
      this.busy.set(null);
    }
  }
}
