import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminFeatureFlagsService, FeatureFlag } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { FeatureFlagsService } from '../../../core/feature-flags/feature-flags.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

/**
 * `/admin/feature-flags`: every flag with its description, rollout and last change. Only a
 * SUPER_ADMIN can switch a flag, after confirming; the change applies to every instance at once
 * and is audited. Administrators see the list read-only.
 */
@Component({
  selector: 'app-admin-feature-flags-page',
  imports: [
    DatePipe,
    MatIconModule,
    MatSlideToggleModule,
    RelativeTimePipe,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Feature flags"
        subtitle="Switch product areas on or off for everyone. Changes apply at once and are audited."
      />

      @if (!session.isSuperAdmin()) {
        <p class="flags__note" role="note">
          <mat-icon aria-hidden="true">lock</mat-icon>
          Only super admins can change feature flags. You can review them here.
        </p>
      }

      @if (error(); as error) {
        <app-error-state
          title="Feature flags could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          (retry)="load()"
        />
      } @else if (flags(); as list) {
        @if (list.length === 0) {
          <app-empty-state icon="toggle_off" title="No feature flags" />
        } @else {
          <ul class="flags" aria-label="Feature flags">
            @for (flag of list; track flag.key) {
              <li class="flag" [attr.data-flag]="flag.key">
                <div class="flag__text">
                  <div class="flag__title">
                    <span class="flag__key mono">{{ flag.key }}</span>
                    <span
                      class="flag__state"
                      [class.flag__state--on]="flag.enabled"
                      [attr.data-testid]="'flag-state-' + flag.key"
                      >{{ flag.enabled ? 'On' : 'Off' }}</span
                    >
                    @if (flag.enabled && (flag.rolloutPercent ?? 100) < 100) {
                      <span class="flag__rollout">{{ flag.rolloutPercent }}% rollout</span>
                    }
                  </div>
                  @if (flag.description) {
                    <p class="flag__description">{{ flag.description }}</p>
                  }
                  <p class="flag__meta">
                    @if (flag.updatedAt) {
                      Changed {{ flag.updatedAt | relativeTime }}
                      <span class="visually-hidden">({{ flag.updatedAt | date: 'medium' }})</span>
                    }
                    @if (flag.updatedBy) {
                      by <span class="mono">{{ flag.updatedBy }}</span>
                    }
                  </p>
                </div>
                <mat-slide-toggle
                  class="flag__toggle"
                  [checked]="!!flag.enabled"
                  [disabled]="!session.isSuperAdmin() || busyKey() !== null"
                  (change)="toggle(flag, $event)"
                >
                  <span class="visually-hidden">{{ flag.key }}</span>
                </mat-slide-toggle>
              </li>
            }
          </ul>
        }
      } @else {
        <div aria-busy="true">
          <span class="visually-hidden">Loading feature flags</span>
          <app-skeleton variant="list" lines="7" />
        </div>
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .flags__note {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      padding: var(--spacing-3) var(--spacing-4);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
    }
    .flags {
      display: flex;
      flex-direction: column;
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
      padding: var(--spacing-4) var(--spacing-5);
      border-bottom: 1px solid var(--color-border);
    }
    .flag:last-child {
      border-bottom: 0;
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
    }
    .flag__key {
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
    }
    .flag__state {
      padding: 0 var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .flag__state--on {
      background: color-mix(in srgb, var(--color-success) 18%, var(--color-surface));
      color: var(--color-ink);
    }
    .flag__rollout {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .flag__description {
      margin: var(--spacing-1) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .flag__meta {
      margin: var(--spacing-1) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminFeatureFlagsPageComponent {
  private readonly api = inject(AdminFeatureFlagsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly featureFlags = inject(FeatureFlagsService);
  protected readonly session = inject(SessionService);

  protected readonly flags = signal<FeatureFlag[] | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busyKey = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      const flags = await firstValueFrom(
        this.api.listFeatureFlags('body', false, { context: silentErrors() }),
      );
      this.flags.set([...(flags ?? [])].sort((a, b) => (a.key ?? '').localeCompare(b.key ?? '')));
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }

  protected async toggle(flag: FeatureFlag, event: MatSlideToggleChange): Promise<void> {
    // The switch only moves once the change is confirmed and saved.
    event.source.checked = !!flag.enabled;
    const key = flag.key ?? '';
    const enable = !flag.enabled;
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: `Turn ${enable ? 'on' : 'off'} ${key}?`,
            message: enable
              ? 'Collectors get this feature on every device right away. The change is recorded in the audit log.'
              : 'The feature disappears for every collector right away and its API answers “not available”. The change is recorded in the audit log.',
            confirmLabel: enable ? 'Turn on' : 'Turn off',
            tone: enable ? 'default' : 'danger',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }
    this.busyKey.set(key);
    try {
      const updated = await firstValueFrom(
        this.api.updateFeatureFlag(
          {
            key,
            updateFeatureFlagRequest: {
              enabled: enable,
              rolloutPercent: flag.rolloutPercent,
              description: flag.description,
            },
          },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.flags.update((list) =>
        (list ?? []).map((candidate) => (candidate.key === key ? updated : candidate)),
      );
      this.snackBar.open(`${key} is now ${updated.enabled ? 'on' : 'off'}.`, 'OK', {
        duration: 4000,
      });
      void this.featureFlags.load();
    } catch (error) {
      this.snackBar.open(friendlyMessage(toApiError(error)), 'OK', { duration: 6000 });
    } finally {
      this.busyKey.set(null);
    }
  }
}
