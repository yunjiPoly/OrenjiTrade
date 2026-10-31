import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AdminFeatureFlagsService, FeatureFlag } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { FeatureFlagsService } from '../../../core/feature-flags/feature-flags.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { ToastService } from '../../../core/feedback/toast.service';
import { AdminIconComponent } from '../console/admin-icon.component';
import { RECORDED, runConsoleAction } from '../console/console-actions';
import { changedLine } from '../console/editor-line';
import { flagInfo, rolloutProblem, sortFlags } from './flag-info';

/**
 * `/admin/feature-flags`: every flag with its description, rollout and last change. Only a
 * SUPER_ADMIN can switch a flag, after confirming; the change applies to every instance at once
 * and is audited. Administrators see the list read-only.
 */
@Component({
  selector: 'app-admin-feature-flags-page',
  imports: [
    MatSlideToggleModule,
    AdminIconComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="cp">
      <header class="cp__head">
        <div class="cp__heading">
          <p class="cp__eyebrow">Rules</p>
          <h1 class="cp__title">Feature flags</h1>
          <p class="cp__sub">
            Switch product areas on or off for everyone. Changes apply at once and are audited.
          </p>
        </div>
      </header>
      @if (!session.isSuperAdmin()) {
        <p class="ff__note" role="note">
          <app-admin-icon name="lock" [size]="18" />
          Only super admins can change feature flags. You can review them here.
        </p>
      }
      @if (error(); as error) {
        <app-error-state
          title="Feature flags could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          retryLabel="Try again"
          (retry)="load()"
        />
      } @else if (flags(); as list) {
        @if (list.length === 0) {
          <app-empty-state icon="toggle_off" title="No feature flags" />
        } @else {
          <p class="cp-count">
            {{ list.length }} {{ list.length === 1 ? 'flag' : 'flags' }} · {{ onCount() }} on
          </p>
          <ul class="ff" aria-label="Feature flags">
            @for (flag of list; track flag.key) {
              @let info = infoOf(flag);
              <li class="cp-card ff__flag" [attr.data-flag]="flag.key">
                <div class="ff__text">
                  <div class="ff__title">
                    <h2 class="ff__name">{{ info.name }}</h2>
                    <code class="cp-mono ff__key">{{ flag.key }}</code>
                    <span
                      class="cp-chip"
                      [class.cp-chip--success]="flag.enabled"
                      [attr.data-testid]="'flag-state-' + flag.key"
                      >{{ flag.enabled ? 'On' : 'Off' }}</span
                    >
                    @if (flag.enabled && (flag.rolloutPercent ?? 100) < 100) {
                      <span class="cp-chip cp-chip--warning"
                        >{{ flag.rolloutPercent }}% rollout</span
                      >
                    }
                  </div>
                  <p class="ff__desc">{{ info.description || flag.description }}</p>
                  <p class="ff__meta">{{ changed(flag) }}</p>
                  @if (info.locked) {
                    <p class="ff__locked" role="note">
                      <app-admin-icon name="lock" [size]="16" />
                      {{ info.locked }}
                    </p>
                  } @else if (info.note) {
                    <p class="ff__adr" role="note">
                      <app-admin-icon name="info" [size]="16" />
                      {{ info.note }}
                    </p>
                  }
                  @if (flag.enabled && !info.locked) {
                    <form
                      class="ff__rollout"
                      (submit)="$event.preventDefault(); saveRollout(flag)"
                      novalidate
                    >
                      <label class="cp-field">
                        <span class="cp-field__label">Rollout</span>
                        <span class="ff__pct">
                          <input
                            class="cp-input"
                            inputmode="numeric"
                            [id]="'ff-rollout-' + flag.key"
                            [value]="rolloutDraft()[flag.key ?? ''] ?? flag.rolloutPercent"
                            [attr.aria-invalid]="rolloutError(flag) ? 'true' : null"
                            [attr.aria-describedby]="'ff-rollout-help-' + flag.key"
                            [disabled]="!session.isSuperAdmin()"
                            (input)="setRollout(flag, $event)"
                          />
                          <span aria-hidden="true">%</span>
                        </span>
                      </label>
                      @if (session.isSuperAdmin()) {
                        <button
                          type="submit"
                          class="cb cb--outline cb--small"
                          [attr.aria-disabled]="
                            !rolloutChanged(flag) || busyKey() !== null ? 'true' : null
                          "
                        >
                          Save rollout
                        </button>
                      }
                      <p
                        class="ff__help"
                        [class.ff__help--bad]="!!rolloutError(flag)"
                        [id]="'ff-rollout-help-' + flag.key"
                      >
                        {{
                          rolloutError(flag) ||
                            'Share of accounts that see it while it’s on. Signed-out visitors only see it at 100%.'
                        }}
                      </p>
                    </form>
                  }
                </div>
                <mat-slide-toggle
                  class="ff__toggle"
                  [checked]="!!flag.enabled"
                  [disabled]="!session.isSuperAdmin() || busyKey() !== null || !!info.locked"
                  (change)="toggle(flag, $event)"
                >
                  <span class="visually-hidden">{{ info.name }} ({{ flag.key }})</span>
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
  styleUrls: ['../console/console-page.scss', '../console/console-controls.scss'],
  styles: `
    .ff__note,
    .ff__locked,
    .ff__adr {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 16px;
      padding: 10px 14px;
      border-radius: 12px;
      background: var(--color-surface-variant);
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .ff__locked,
    .ff__adr {
      margin: 10px 0 0;
    }
    .ff__adr {
      background: var(--color-accent-tint);
      color: var(--color-ink);
    }
    .ff {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .ff__flag {
      display: flex;
      align-items: flex-start;
      gap: 20px;
      padding: 18px 22px;
    }
    .ff__text {
      flex: 1 1 auto;
      min-width: 0;
    }
    .ff__title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 10px;
    }
    .ff__name {
      margin: 0;
      color: var(--color-ink);
      font-family: var(--font-display);
      font-size: 17px;
      font-weight: var(--font-weight-semibold);
    }
    .ff__key {
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }
    .ff__desc {
      margin: 6px 0 0;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
    }
    .ff__meta {
      margin: 6px 0 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }
    .ff__rollout {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 6px 12px;
      margin-top: 12px;
    }
    .ff__pct {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--color-text-secondary);
    }
    .ff__pct .cp-input {
      width: 84px;
    }
    .ff__help {
      flex-basis: 100%;
      margin: 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }
    .ff__help--bad {
      color: var(--app-danger-text);
      font-weight: var(--font-weight-semibold);
    }
    .ff__toggle {
      flex: none;
      margin-top: 4px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminFeatureFlagsPageComponent {
  private readonly api = inject(AdminFeatureFlagsService);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);
  private readonly featureFlags = inject(FeatureFlagsService);
  protected readonly session = inject(SessionService);

  protected readonly flags = signal<FeatureFlag[] | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busyKey = signal<string | null>(null);
  protected readonly rolloutDraft = signal<Record<string, string>>({});
  protected readonly onCount = computed(() => (this.flags() ?? []).filter((f) => f.enabled).length);
  protected readonly infoOf = flagInfo;

  /** "Changed Oct 15 by Alex Morin" (spec 15.8: a name, never an id). */
  protected changed(flag: FeatureFlag): string {
    return changedLine(flag, 'Changed');
  }

  protected setRollout(flag: FeatureFlag, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.rolloutDraft.update((draft) => ({ ...draft, [flag.key ?? '']: value }));
  }

  protected rolloutError(flag: FeatureFlag): string | null {
    const raw = this.rolloutDraft()[flag.key ?? ''];
    return raw === undefined ? null : rolloutProblem(raw);
  }

  protected rolloutChanged(flag: FeatureFlag): boolean {
    const raw = this.rolloutDraft()[flag.key ?? ''];
    return raw !== undefined && !rolloutProblem(raw) && Number(raw) !== flag.rolloutPercent;
  }

  /** The rollout of a flag that is on (`PUT /admin/feature-flags/{key}`, confirmed, audited). */
  protected async saveRollout(flag: FeatureFlag): Promise<void> {
    const key = flag.key ?? '';
    if (!this.rolloutChanged(flag) || this.busyKey() !== null) {
      if (this.rolloutError(flag)) {
        document.getElementById('ff-rollout-' + key)?.focus();
      }
      return;
    }
    const percent = Number(this.rolloutDraft()[key]);
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: `Roll ${key} out to ${percent}%?`,
            message:
              percent >= 100
                ? 'Every account and signed-out visitors see it right away. The change is recorded in the audit log.'
                : `About ${percent}% of accounts see it; signed-out visitors no longer do. The change is recorded in the audit log.`,
            confirmLabel: 'Save rollout',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }
    this.busyKey.set(key);
    const updated = await runConsoleAction(
      this.toasts,
      this.api.updateFeatureFlag(
        {
          key,
          updateFeatureFlagRequest: {
            enabled: true,
            rolloutPercent: percent,
            description: flag.description,
          },
        },
        'body',
        false,
        { context: silentErrors() },
      ),
      `${key} rolls out to ${percent}%.`,
    );
    this.busyKey.set(null);
    if (updated) {
      this.flags.update((list) =>
        (list ?? []).map((candidate) => (candidate.key === key ? updated : candidate)),
      );
      this.rolloutDraft.update((draft) => {
        const next = { ...draft };
        delete next[key];
        return next;
      });
      void this.featureFlags.load();
    }
  }

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
      this.flags.set(sortFlags(flags ?? []));
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
      this.toasts.show({
        title: `${key} is now ${updated.enabled ? 'on' : 'off'}.`,
        sub: RECORDED,
      });
      void this.featureFlags.load();
    } catch (error) {
      const apiError = toApiError(error);
      this.toasts.show({
        title: friendlyMessage(apiError),
        sub: apiError.requestId ? `Request ${apiError.requestId}` : null,
        tone: 'error',
      });
    } finally {
      this.busyKey.set(null);
    }
  }
}
