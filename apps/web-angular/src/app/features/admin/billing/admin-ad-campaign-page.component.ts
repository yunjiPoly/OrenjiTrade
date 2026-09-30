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
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import {
  AdCampaignRequest,
  AdCampaignStats,
  AdCreativeRequest,
  AdTargetingRule,
  AdminAdCampaignDetail,
  AdminAdCreative,
  AdminAdvertiser,
  AdminBillingService,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { amountLabel } from '../../../shared/billing/billing-labels';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { confirmAdminAction, runAdminAction } from '../shared/admin-actions';
import { AdminChipComponent } from '../shared/admin-chip.component';
import { placementLabel, statusText, statusTone } from './admin-billing-labels';
import { CampaignDialogComponent, CampaignDialogData } from './campaign-dialog.component';
import { campaignUpdate } from './campaign-form';
import { CreativeDialogComponent } from './creative-dialog.component';
import { TargetingEditorComponent } from './targeting-editor.component';

/**
 * `/admin/ads/campaigns/:id` (ADMIN): one campaign — schedule, budget, pricing and status
 * (activate / pause / end), targeting rules, creatives per placement and delivery statistics
 * (impressions, clicks, CTR, derived spend, the last 30 days). Every write is audited.
 */
@Component({
  selector: 'app-admin-ad-campaign-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    AdminChipComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
    TargetingEditorComponent,
  ],
  template: `
    <div class="admin-page">
      <a class="billing-back" routerLink="/admin/ads">
        <mat-icon aria-hidden="true">arrow_back</mat-icon>
        Ads
      </a>
      @if (error(); as error) {
        <app-error-state
          [title]="
            error.status === 404 ? 'This campaign does not exist' : 'The campaign could not load'
          "
          [message]="message(error)"
          [requestId]="error.requestId"
          (retry)="load()"
        />
      } @else if (detail(); as d) {
        @let c = d.campaign!;
        <div class="billing-sections">
          <section class="admin-card" aria-labelledby="campaign-title">
            <div class="billing-head">
              <div>
                <h1 id="campaign-title">{{ c.name }}</h1>
                <p class="admin-muted">
                  {{ c.advertiserName }} ·
                  <a routerLink="/admin/audit-logs" [queryParams]="{ targetId: c.id }">Audit log</a>
                </p>
              </div>
              <app-admin-chip [tone]="tone(c.status)" data-testid="campaign-status">{{
                text(c.status)
              }}</app-admin-chip>
            </div>
            <dl class="billing-facts">
              <div>
                <dt>Schedule</dt>
                <dd>
                  {{ c.startAt | date: 'medium' }} –
                  {{ c.endAt ? (c.endAt | date: 'medium') : 'no end' }}
                </dd>
              </div>
              <div>
                <dt>Pricing</dt>
                <dd>
                  {{ c.pricing }}
                  @if (c.pricing !== 'FLAT') {
                    · {{ money(c.bidAmount, c.currency) }}
                    {{ c.pricing === 'CPC' ? 'per click' : 'per 1000 views' }}
                  }
                </dd>
              </div>
              <div>
                <dt>Budget</dt>
                <dd data-testid="campaign-budget">
                  {{ money(c.budgetTotal, c.currency) }}
                  @if (c.budgetDaily !== null && c.budgetDaily !== undefined) {
                    · {{ money(c.budgetDaily, c.currency) }} / day
                  }
                </dd>
              </div>
              <div>
                <dt>Spent · remaining</dt>
                <dd>
                  {{ money(c.spent, c.currency) }} · {{ money(c.remainingBudget, c.currency) }}
                </dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{{ c.priority ?? 0 }}</dd>
              </div>
              <div>
                <dt>Views per member per day</dt>
                <dd>{{ c.frequencyCapPerDay ?? 'No cap' }}</dd>
              </div>
            </dl>
            <div class="billing-actions campaign-actions">
              <button matButton="filled" type="button" [disabled]="busy()" (click)="edit()">
                <mat-icon aria-hidden="true">edit</mat-icon>
                Edit campaign
              </button>
              @if (c.status === 'ACTIVE') {
                <button
                  matButton="outlined"
                  type="button"
                  [disabled]="busy()"
                  (click)="setStatus('PAUSED')"
                >
                  Pause
                </button>
              } @else if (c.status !== 'ENDED') {
                <button
                  matButton="outlined"
                  type="button"
                  [disabled]="busy()"
                  (click)="setStatus('ACTIVE')"
                >
                  {{ c.status === 'PAUSED' ? 'Resume' : 'Activate' }}
                </button>
              }
              @if (c.status !== 'ENDED') {
                <button
                  matButton="outlined"
                  type="button"
                  class="billing-danger"
                  [disabled]="busy()"
                  (click)="setStatus('ENDED')"
                >
                  End campaign
                </button>
              }
            </div>
          </section>

          <section class="admin-card" aria-labelledby="stats-title">
            <h2 id="stats-title">Delivery</h2>
            <ul class="billing-tiles" aria-label="Totals">
              <li class="billing-tile">
                <span class="billing-tile__label">Impressions</span>
                <span class="billing-tile__value" data-testid="stat-impressions">{{
                  d.totals?.impressions ?? 0
                }}</span>
              </li>
              <li class="billing-tile">
                <span class="billing-tile__label">Clicks</span>
                <span class="billing-tile__value">{{ d.totals?.clicks ?? 0 }}</span>
              </li>
              <li class="billing-tile">
                <span class="billing-tile__label">Click-through rate</span>
                <span class="billing-tile__value">{{ percent(d.totals?.ctrPercent) }}</span>
              </li>
              <li class="billing-tile">
                <span class="billing-tile__label">Conversions</span>
                <span class="billing-tile__value">{{ d.totals?.conversions ?? 0 }}</span>
              </li>
            </ul>
            @if (stats(); as s) {
              @if ((s.daily ?? []).length) {
                <div class="billing-table-wrap">
                  <table class="billing-table" aria-label="Daily delivery">
                    <thead>
                      <tr>
                        <th scope="col">Day (UTC)</th>
                        <th scope="col" class="num">Impressions</th>
                        <th scope="col" class="num">Clicks</th>
                        <th scope="col" class="num">CTR</th>
                        <th scope="col" class="num">Spent</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (day of s.daily ?? []; track day.day) {
                        <tr>
                          <td class="nowrap">{{ day.day }}</td>
                          <td class="num">{{ day.impressions }}</td>
                          <td class="num">{{ day.clicks }}</td>
                          <td class="num">{{ percent(day.ctrPercent) }}</td>
                          <td class="num">{{ money(day.spent, s.currency) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <p class="admin-muted">No delivery in the last 30 days.</p>
              }
            } @else if (statsError()) {
              <p class="admin-muted">Daily statistics could not load.</p>
            } @else {
              <app-skeleton variant="list" lines="2" />
            }
          </section>

          <section class="admin-card" aria-labelledby="targeting-title">
            <h2 id="targeting-title">Targeting</h2>
            <app-targeting-editor
              [rules]="d.targeting ?? []"
              [busy]="busy()"
              (save)="saveTargeting($event)"
            />
          </section>

          <section class="admin-card" aria-labelledby="creatives-title">
            <div class="billing-head">
              <h2 id="creatives-title">Creatives</h2>
              <button matButton="filled" type="button" (click)="editCreative(null)">
                <mat-icon aria-hidden="true">add</mat-icon>
                Add creative
              </button>
            </div>
            @if ((d.creatives ?? []).length === 0) {
              <app-empty-state
                icon="image"
                title="No creatives yet"
                description="Add one per placement where the campaign should appear."
              />
            } @else {
              <ul class="creatives" aria-label="Creatives">
                @for (creative of d.creatives ?? []; track creative.id) {
                  <li class="creative">
                    <div class="creative__head">
                      <span class="creative__label">Sponsored</span>
                      <app-admin-chip [tone]="tone(creative.status)">{{
                        text(creative.status)
                      }}</app-admin-chip>
                    </div>
                    <strong>{{ creative.headline }}</strong>
                    @if (creative.body) {
                      <span class="admin-muted">{{ creative.body }}</span>
                    }
                    <span class="creative__meta">
                      {{ where(creative.placement) }} · {{ creative.ctaLabel }} →
                      <code>{{ creative.landingUrl }}</code>
                    </span>
                    <button
                      matButton
                      type="button"
                      [attr.aria-label]="'Edit creative ' + creative.headline"
                      (click)="editCreative(creative)"
                    >
                      Edit
                    </button>
                  </li>
                }
              </ul>
            }
          </section>
        </div>
      } @else {
        <div aria-busy="true">
          <span class="visually-hidden">Loading the campaign</span>
          <app-skeleton height="200px" />
          <app-skeleton variant="list" lines="4" />
        </div>
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss', './admin-billing.scss'],
  styles: `
    h1 {
      margin: 0;
      font-size: var(--font-size-xl);
    }
    .campaign-actions {
      margin-top: var(--spacing-4);
    }
    .creatives {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--spacing-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .creative {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-1);
      padding: var(--spacing-3) var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-surface-variant) 45%, var(--color-surface));
    }
    .creative__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
    }
    .creative__label {
      padding: 1px var(--spacing-2);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-sm);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      text-transform: uppercase;
    }
    .creative__meta {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      overflow-wrap: anywhere;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAdCampaignPageComponent {
  private readonly api = inject(AdminBillingService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly id = input.required<string>();

  protected readonly detail = signal<AdminAdCampaignDetail | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly stats = signal<AdCampaignStats | null>(null);
  protected readonly statsError = signal(false);
  protected readonly busy = signal(false);
  protected readonly text = statusText;
  protected readonly tone = statusTone;
  protected readonly money = amountLabel;
  protected readonly where = placementLabel;
  private readonly campaign = computed(() => this.detail()?.campaign ?? null);

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.load());
    });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected percent(value: number | null | undefined): string {
    return `${(value ?? 0).toLocaleString('en-CA', { maximumFractionDigits: 2 })} %`;
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.detail.set(
        await firstValueFrom(
          this.api.getAdminAdCampaign({ id: this.id() }, 'body', false, {
            context: silentErrors(),
          }),
        ),
      );
      void this.loadStats();
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }

  private async loadStats(): Promise<void> {
    this.statsError.set(false);
    try {
      this.stats.set(
        await firstValueFrom(
          this.api.getAdminAdCampaignStats({ id: this.id() }, 'body', false, {
            context: silentErrors(),
          }),
        ),
      );
    } catch {
      this.statsError.set(true);
    }
  }

  protected async edit(): Promise<void> {
    const campaign = this.campaign();
    if (!campaign) {
      return;
    }
    let advertisers: AdminAdvertiser[];
    try {
      advertisers =
        (await firstValueFrom(
          this.api.listAdminAdvertisers('body', false, { context: silentErrors() }),
        )) ?? [];
    } catch (error) {
      this.snackBar.open(friendlyMessage(toApiError(error)), 'OK', { duration: 6000 });
      return;
    }
    this.dialog
      .open<CampaignDialogComponent, CampaignDialogData, AdCampaignRequest>(
        CampaignDialogComponent,
        {
          data: { campaign, advertisers },
          panelClass: 'app-dialog--lg',
        },
      )
      .afterClosed()
      .subscribe((request) => {
        if (request) {
          void this.update(request, 'The campaign is saved.');
        }
      });
  }

  protected async setStatus(status: 'ACTIVE' | 'PAUSED' | 'ENDED'): Promise<void> {
    const campaign = this.campaign();
    if (!campaign) {
      return;
    }
    const wording = {
      ACTIVE: {
        title: 'Activate this campaign?',
        message: 'Its active creatives start serving within its schedule and budget.',
        confirm: 'Activate',
        done: 'The campaign is active.',
      },
      PAUSED: {
        title: 'Pause this campaign?',
        message: 'Its ads stop serving until you resume it.',
        confirm: 'Pause',
        done: 'The campaign is paused.',
      },
      ENDED: {
        title: 'End this campaign?',
        message: 'Its ads stop serving for good. Statistics stay available.',
        confirm: 'End campaign',
        done: 'The campaign has ended.',
      },
    }[status];
    const confirmed = await confirmAdminAction(this.dialog, {
      title: wording.title,
      message: wording.message,
      confirmLabel: wording.confirm,
      tone: status === 'ENDED' ? 'danger' : 'default',
    });
    if (confirmed) {
      await this.update(
        campaignUpdate(campaign, { status: status as AdCampaignRequest['status'] }),
        wording.done,
      );
    }
  }

  protected async saveTargeting(rules: AdTargetingRule[]): Promise<void> {
    this.busy.set(true);
    const saved = await runAdminAction(
      this.snackBar,
      this.api.replaceAdminAdTargeting(
        { id: this.id(), adTargetingRequest: { rules } },
        'body',
        false,
        { context: silentErrors() },
      ),
      'The targeting is saved.',
    );
    this.busy.set(false);
    if (saved) {
      this.detail.set(saved);
    }
  }

  protected editCreative(creative: AdminAdCreative | null): void {
    this.dialog
      .open<CreativeDialogComponent, AdminAdCreative | null, AdCreativeRequest>(
        CreativeDialogComponent,
        { data: creative, panelClass: 'app-dialog--md' },
      )
      .afterClosed()
      .subscribe(async (request) => {
        if (!request) {
          return;
        }
        const saved = await runAdminAction(
          this.snackBar,
          creative?.id
            ? this.api.updateAdminAdCreative(
                { id: creative.id, adCreativeRequest: request },
                'body',
                false,
                { context: silentErrors() },
              )
            : this.api.createAdminAdCreative(
                { id: this.id(), adCreativeRequest: request },
                'body',
                false,
                { context: silentErrors() },
              ),
          creative ? 'The creative is saved.' : 'The creative is added.',
        );
        if (saved) {
          void this.load();
        }
      });
  }

  private async update(request: AdCampaignRequest, done: string): Promise<void> {
    this.busy.set(true);
    const saved = await runAdminAction(
      this.snackBar,
      this.api.updateAdminAdCampaign({ id: this.id(), adCampaignRequest: request }, 'body', false, {
        context: silentErrors(),
      }),
      done,
    );
    this.busy.set(false);
    if (saved) {
      this.detail.set(saved);
      void this.loadStats();
    }
  }
}
