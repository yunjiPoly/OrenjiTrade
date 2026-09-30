import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminPlansService, Entitlement, GrantEntitlementRequest } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { entitlementLabel, entitlementSourceLabel } from '../../../shared/billing/billing-labels';
import { humanizeKey } from '../../../shared/plans/plan-labels';
import { PlansStore } from '../../../shared/plans/plans.store';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { confirmAdminAction, runAdminAction } from '../shared/admin-actions';
import { AdminChipComponent } from '../shared/admin-chip.component';
import {
  EntitlementKey,
  GrantEntitlementDialogComponent,
  GrantEntitlementDialogData,
} from './grant-entitlement-dialog.component';

/**
 * Entitlements of one account on the admin user page (`GET/POST/DELETE
 * /admin/users/{id}/entitlements`): active, expired and revoked overrides with their source,
 * a "Grant entitlement" dialog and revoke (both audited `entitlement.*`).
 */
@Component({
  selector: 'app-user-entitlements-panel',
  imports: [DatePipe, MatButtonModule, AdminChipComponent, ErrorStateComponent, SkeletonComponent],
  template: `
    <section class="admin-card" aria-labelledby="detail-entitlements">
      <div class="head">
        <h2 id="detail-entitlements">Entitlements</h2>
        <button matButton="outlined" type="button" [disabled]="busy()" (click)="grant()">
          Grant entitlement
        </button>
      </div>
      @if (error(); as error) {
        <app-error-state
          compact
          title="Entitlements could not load"
          [message]="message(error)"
          (retry)="load()"
        />
      } @else if (entitlements(); as list) {
        @if (list.length === 0) {
          <p class="admin-muted">No overrides: the plan's limits apply.</p>
        } @else {
          <ul class="list" aria-label="Entitlements">
            @for (entitlement of list; track entitlement.id) {
              <li data-testid="entitlement-row">
                <span class="what">
                  <strong>{{ name(entitlement) }}</strong>
                  <span class="admin-muted">
                    {{ source(entitlement.source) }} · granted
                    {{ entitlement.createdAt | date: 'mediumDate' }}
                    @if (entitlement.expiresAt) {
                      · until {{ entitlement.expiresAt | date: 'medium' }}
                    }
                    @if (entitlement.note) {
                      · “{{ entitlement.note }}”
                    }
                  </span>
                </span>
                <app-admin-chip [tone]="state(entitlement).tone">{{
                  state(entitlement).label
                }}</app-admin-chip>
                @if (state(entitlement).label === 'Active') {
                  <button
                    matButton
                    type="button"
                    class="revoke"
                    [disabled]="busy()"
                    [attr.aria-label]="'Revoke ' + name(entitlement)"
                    (click)="revoke(entitlement)"
                  >
                    Revoke
                  </button>
                }
              </li>
            }
          </ul>
        }
      } @else {
        <app-skeleton variant="list" lines="2" />
      }
    </section>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
      margin-bottom: var(--spacing-3);
    }
    .head h2 {
      margin: 0;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .list li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2) var(--spacing-3);
      padding-bottom: var(--spacing-2);
      border-bottom: 1px dashed var(--color-border);
    }
    .list li:last-child {
      border-bottom: 0;
    }
    .what {
      display: flex;
      flex: 1 1 240px;
      flex-direction: column;
      min-width: 0;
    }
    .revoke {
      --mat-button-text-label-text-color: var(--color-danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserEntitlementsPanelComponent {
  private readonly api = inject(AdminPlansService);
  private readonly plans = inject(PlansStore);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly userId = input.required<string>();
  readonly handle = input.required<string>();

  protected readonly entitlements = signal<Entitlement[] | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal(false);
  /** Limits and features of the plans (live data), offered in the grant dialog. */
  private readonly keys = computed<EntitlementKey[]>(() => {
    const keys = new Map<string, EntitlementKey>();
    for (const plan of this.plans.plans() ?? []) {
      for (const limit of plan.limits ?? []) {
        if (limit.key && !keys.has(limit.key)) {
          keys.set(limit.key, {
            key: limit.key,
            label: limit.description || humanizeKey(limit.key),
            kind: 'limit',
          });
        }
      }
      for (const feature of plan.features ?? []) {
        if (feature.key && !keys.has(feature.key)) {
          keys.set(feature.key, {
            key: feature.key,
            label: entitlementLabel(feature.key, null),
            kind: 'feature',
          });
        }
      }
    }
    return [...keys.values()];
  });

  constructor() {
    void this.plans.load();
    effect(() => {
      this.userId();
      untracked(() => void this.load());
    });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  /** "Wishlist items: unlimited" for limits (plan wording), feature names otherwise. */
  protected name(entitlement: Entitlement): string {
    const limit = this.keys().find(
      (option) => option.key === entitlement.featureKey && option.kind === 'limit',
    );
    return limit
      ? `${limit.label}: ${entitlement.value ?? ''}`
      : entitlementLabel(entitlement.featureKey, entitlement.value);
  }

  protected source(source: string | undefined): string {
    return entitlementSourceLabel(source);
  }

  protected state(entitlement: Entitlement): {
    label: string;
    tone: 'success' | 'neutral' | 'warning';
  } {
    if (entitlement.revokedAt) {
      return { label: 'Revoked', tone: 'warning' };
    }
    if (entitlement.expiresAt && Date.parse(entitlement.expiresAt) <= Date.now()) {
      return { label: 'Expired', tone: 'neutral' };
    }
    return { label: 'Active', tone: 'success' };
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.entitlements.set(
        (await firstValueFrom(
          this.api.listUserEntitlements({ id: this.userId() }, 'body', false, {
            context: silentErrors(),
          }),
        )) ?? [],
      );
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }

  protected grant(): void {
    this.dialog
      .open<GrantEntitlementDialogComponent, GrantEntitlementDialogData, GrantEntitlementRequest>(
        GrantEntitlementDialogComponent,
        { data: { handle: this.handle(), keys: this.keys() }, panelClass: 'app-dialog--md' },
      )
      .afterClosed()
      .subscribe(async (request) => {
        if (!request) {
          return;
        }
        this.busy.set(true);
        const saved = await runAdminAction(
          this.snackBar,
          this.api.grantEntitlement(
            { id: this.userId(), grantEntitlementRequest: request },
            'body',
            false,
            { context: silentErrors() },
          ),
          'The entitlement is granted.',
        );
        this.busy.set(false);
        if (saved) {
          void this.load();
        }
      });
  }

  protected async revoke(entitlement: Entitlement): Promise<void> {
    if (!entitlement.id) {
      return;
    }
    const confirmed = await confirmAdminAction(this.dialog, {
      title: `Revoke “${this.name(entitlement)}”?`,
      message: 'The plan’s value applies again at once.',
      confirmLabel: 'Revoke',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    this.busy.set(true);
    await runAdminAction(
      this.snackBar,
      this.api.revokeEntitlement(
        { id: this.userId(), entitlementId: entitlement.id },
        'body',
        false,
        { context: silentErrors() },
      ),
      'The entitlement is revoked.',
    );
    this.busy.set(false);
    // 204 No Content: reload either way (a refusal was already explained).
    void this.load();
  }
}
