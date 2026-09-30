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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import {
  AdCampaignRequest,
  AdPlacementRequest,
  AdminAdCampaign,
  AdminAdPlacement,
  AdminAdvertiser,
  AdminBillingService,
  AdvertiserRequest,
  ListAdminAdCampaignsRequestParams,
  UpdateAdminAdPlacementRequestParams,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { amountLabel } from '../../../shared/billing/billing-labels';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { runAdminAction } from '../shared/admin-actions';
import { AdminChipComponent } from '../shared/admin-chip.component';
import { AdvertiserDialogComponent } from './advertiser-dialog.component';
import { CAMPAIGN_STATUSES, placementLabel, statusText, statusTone } from './admin-billing-labels';
import { CampaignDialogComponent, CampaignDialogData } from './campaign-dialog.component';
import { PlacementDialogComponent } from './placement-dialog.component';

const TABS = ['campaigns', 'advertisers', 'placements'] as const;
type AdsTab = (typeof TABS)[number];

/**
 * `/admin/ads` (ADMIN, `?tab=campaigns|advertisers|placements&status=`): internal ad campaigns
 * (list, filter, create; a row opens the campaign with its creatives, targeting and stats),
 * advertisers (create, edit) and placements (name, active, ads per request). Every write is
 * audited (`ads.*`).
 */
@Component({
  selector: 'app-admin-ads-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTabsModule,
    AdminChipComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Ads"
        subtitle="Internal sponsored campaigns. Ads are always labelled “Sponsored” and never target exact locations."
      />
      <mat-tab-group
        mat-stretch-tabs="false"
        animationDuration="150ms"
        [selectedIndex]="tabIndex()"
        (selectedIndexChange)="setTab($event)"
      >
        <mat-tab label="Campaigns">
          <section class="tab" aria-label="Campaigns">
            <div class="billing-head">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Status</mat-label>
                <mat-select
                  [value]="statusFilter() ?? null"
                  (selectionChange)="setStatus($event.value)"
                >
                  <mat-option [value]="null">Any status</mat-option>
                  @for (status of campaignStatuses; track status) {
                    <mat-option [value]="status">{{ text(status) }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <button matButton="filled" type="button" (click)="newCampaign()">
                <mat-icon aria-hidden="true">add</mat-icon>
                New campaign
              </button>
            </div>
            @if (campaignsError(); as error) {
              <app-error-state
                title="Campaigns could not load"
                [message]="message(error)"
                (retry)="loadCampaigns()"
              />
            } @else if (campaigns(); as list) {
              @if (list.length === 0) {
                <app-empty-state
                  icon="campaign"
                  title="No campaigns"
                  description="Create one for an advertiser."
                />
              } @else {
                <div class="billing-table-wrap">
                  <table class="billing-table" aria-label="Campaigns">
                    <thead>
                      <tr>
                        <th scope="col">Campaign</th>
                        <th scope="col">Status</th>
                        <th scope="col">Pricing</th>
                        <th scope="col" class="num">Spent / budget</th>
                        <th scope="col">Schedule</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (campaign of list; track campaign.id) {
                        <tr data-testid="campaign-row">
                          <td>
                            <a
                              class="strong"
                              [routerLink]="['/admin/ads/campaigns', campaign.id]"
                              >{{ campaign.name }}</a
                            >
                            <span class="muted">{{ campaign.advertiserName }}</span>
                          </td>
                          <td>
                            <app-admin-chip [tone]="tone(campaign.status)">{{
                              text(campaign.status)
                            }}</app-admin-chip>
                          </td>
                          <td>
                            {{ campaign.pricing }}
                            @if (campaign.pricing !== 'FLAT') {
                              <span class="muted">{{
                                money(campaign.bidAmount, campaign.currency)
                              }}</span>
                            }
                          </td>
                          <td class="num">
                            {{ money(campaign.spent, campaign.currency) }} /
                            {{ money(campaign.budgetTotal, campaign.currency) }}
                          </td>
                          <td class="nowrap">
                            {{ campaign.startAt | date: 'mediumDate' }} –
                            {{ campaign.endAt ? (campaign.endAt | date: 'mediumDate') : 'open' }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            } @else {
              <app-skeleton variant="list" lines="4" />
            }
          </section>
        </mat-tab>

        <mat-tab label="Advertisers">
          <section class="tab" aria-label="Advertisers">
            <div class="billing-head">
              <p class="admin-muted">Business contacts are visible to admins only.</p>
              <button matButton="filled" type="button" (click)="editAdvertiser(null)">
                <mat-icon aria-hidden="true">add</mat-icon>
                New advertiser
              </button>
            </div>
            @if (advertisersError(); as error) {
              <app-error-state
                title="Advertisers could not load"
                [message]="message(error)"
                (retry)="loadAdvertisers()"
              />
            } @else if (advertisers(); as list) {
              @if (list.length === 0) {
                <app-empty-state icon="storefront" title="No advertisers yet" />
              } @else {
                <div class="billing-table-wrap">
                  <table class="billing-table" aria-label="Advertisers">
                    <thead>
                      <tr>
                        <th scope="col">Advertiser</th>
                        <th scope="col">Contact</th>
                        <th scope="col">Status</th>
                        <th scope="col"><span class="visually-hidden">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (advertiser of list; track advertiser.id) {
                        <tr>
                          <td class="strong">{{ advertiser.name }}</td>
                          <td>{{ advertiser.contactEmail ?? '—' }}</td>
                          <td>
                            <app-admin-chip [tone]="tone(advertiser.status)">{{
                              text(advertiser.status)
                            }}</app-admin-chip>
                          </td>
                          <td>
                            <button
                              matButton
                              type="button"
                              [attr.aria-label]="'Edit ' + advertiser.name"
                              (click)="editAdvertiser(advertiser)"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            } @else {
              <app-skeleton variant="list" lines="3" />
            }
          </section>
        </mat-tab>

        <mat-tab label="Placements">
          <section class="tab" aria-label="Placements">
            @if (placementsError(); as error) {
              <app-error-state
                title="Placements could not load"
                [message]="message(error)"
                (retry)="loadPlacements()"
              />
            } @else if (placements(); as list) {
              <div class="billing-table-wrap">
                <table class="billing-table" aria-label="Placements">
                  <thead>
                    <tr>
                      <th scope="col">Placement</th>
                      <th scope="col">Where</th>
                      <th scope="col" class="num">Ads per request</th>
                      <th scope="col">Status</th>
                      <th scope="col"><span class="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (placement of list; track placement.key) {
                      <tr>
                        <td class="strong">{{ placement.name }}</td>
                        <td>
                          {{ where(placement.key) }} <span class="muted">{{ placement.key }}</span>
                        </td>
                        <td class="num">{{ placement.maxAds }}</td>
                        <td>
                          <app-admin-chip [tone]="placement.active ? 'success' : 'neutral'">{{
                            placement.active ? 'Serving' : 'Off'
                          }}</app-admin-chip>
                        </td>
                        <td>
                          <button
                            matButton
                            type="button"
                            [attr.aria-label]="'Edit ' + placement.name"
                            (click)="editPlacement(placement)"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <app-skeleton variant="list" lines="4" />
            }
          </section>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss', './admin-billing.scss'],
  styles: `
    .tab {
      padding-top: var(--spacing-4);
    }
    .tab .admin-muted {
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAdsPageComponent {
  private readonly api = inject(AdminBillingService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly tab = input<string | undefined>();
  readonly status = input<string | undefined>();

  protected readonly campaignStatuses = CAMPAIGN_STATUSES;
  protected readonly text = statusText;
  protected readonly tone = statusTone;
  protected readonly money = amountLabel;
  protected readonly where = placementLabel;
  protected readonly tabIndex = computed(() =>
    Math.max(0, TABS.indexOf((this.tab() ?? 'campaigns') as AdsTab)),
  );
  protected readonly statusFilter = computed(() =>
    (CAMPAIGN_STATUSES as readonly string[]).includes(this.status() ?? '')
      ? (this.status() as ListAdminAdCampaignsRequestParams['status'])
      : undefined,
  );
  protected readonly campaigns = signal<AdminAdCampaign[] | null>(null);
  protected readonly campaignsError = signal<ApiError | null>(null);
  protected readonly advertisers = signal<AdminAdvertiser[] | null>(null);
  protected readonly advertisersError = signal<ApiError | null>(null);
  protected readonly placements = signal<AdminAdPlacement[] | null>(null);
  protected readonly placementsError = signal<ApiError | null>(null);

  constructor() {
    effect(() => {
      this.statusFilter();
      untracked(() => void this.loadCampaigns());
    });
    void this.loadAdvertisers();
    void this.loadPlacements();
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected setTab(index: number): void {
    void this.router.navigate([], {
      queryParams: { tab: index === 0 ? null : TABS[index] },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setStatus(value: string | null): void {
    void this.router.navigate([], { queryParams: { status: value }, queryParamsHandling: 'merge' });
  }

  async loadCampaigns(): Promise<void> {
    this.campaignsError.set(null);
    try {
      const page = await firstValueFrom(
        this.api.listAdminAdCampaigns({ status: this.statusFilter(), size: 100 }, 'body', false, {
          context: silentErrors(),
        }),
      );
      this.campaigns.set(page.items ?? []);
    } catch (error) {
      this.campaignsError.set(toApiError(error));
    }
  }

  async loadAdvertisers(): Promise<void> {
    this.advertisersError.set(null);
    try {
      this.advertisers.set(
        (await firstValueFrom(
          this.api.listAdminAdvertisers('body', false, { context: silentErrors() }),
        )) ?? [],
      );
    } catch (error) {
      this.advertisersError.set(toApiError(error));
    }
  }

  async loadPlacements(): Promise<void> {
    this.placementsError.set(null);
    try {
      this.placements.set(
        (await firstValueFrom(
          this.api.listAdminAdPlacements('body', false, { context: silentErrors() }),
        )) ?? [],
      );
    } catch (error) {
      this.placementsError.set(toApiError(error));
    }
  }

  protected newCampaign(): void {
    const advertisers = (this.advertisers() ?? []).filter((a) => a.status !== 'ARCHIVED');
    if (!advertisers.length) {
      this.snackBar.open('Create an advertiser first.', 'OK', { duration: 5000 });
      return;
    }
    this.dialog
      .open<CampaignDialogComponent, CampaignDialogData, AdCampaignRequest>(
        CampaignDialogComponent,
        {
          data: { campaign: null, advertisers },
          panelClass: 'app-dialog--lg',
        },
      )
      .afterClosed()
      .subscribe(async (request) => {
        if (!request) {
          return;
        }
        const created = await runAdminAction(
          this.snackBar,
          this.api.createAdminAdCampaign({ adCampaignRequest: request }, 'body', false, {
            context: silentErrors(),
          }),
          `Campaign “${request.name}” created.`,
        );
        if (created?.campaign?.id) {
          await this.router.navigate(['/admin/ads/campaigns', created.campaign.id]);
        }
      });
  }

  protected editAdvertiser(advertiser: AdminAdvertiser | null): void {
    this.dialog
      .open<AdvertiserDialogComponent, AdminAdvertiser | null, AdvertiserRequest>(
        AdvertiserDialogComponent,
        { data: advertiser, panelClass: 'app-dialog--md' },
      )
      .afterClosed()
      .subscribe(async (request) => {
        if (!request) {
          return;
        }
        const saved = await runAdminAction(
          this.snackBar,
          advertiser?.id
            ? this.api.updateAdminAdvertiser(
                { id: advertiser.id, advertiserRequest: request },
                'body',
                false,
                { context: silentErrors() },
              )
            : this.api.createAdminAdvertiser({ advertiserRequest: request }, 'body', false, {
                context: silentErrors(),
              }),
          advertiser ? `“${request.name}” is saved.` : `Advertiser “${request.name}” created.`,
        );
        if (saved) {
          void this.loadAdvertisers();
          void this.loadCampaigns();
        }
      });
  }

  protected editPlacement(placement: AdminAdPlacement): void {
    this.dialog
      .open<PlacementDialogComponent, AdminAdPlacement, AdPlacementRequest>(
        PlacementDialogComponent,
        { data: placement, panelClass: 'app-dialog--md' },
      )
      .afterClosed()
      .subscribe(async (request) => {
        if (!request || !placement.key) {
          return;
        }
        const saved = await runAdminAction(
          this.snackBar,
          this.api.updateAdminAdPlacement(
            {
              key: placement.key as UpdateAdminAdPlacementRequestParams['key'],
              adPlacementRequest: request,
            },
            'body',
            false,
            { context: silentErrors() },
          ),
          `Placement “${request.name}” is saved.`,
        );
        if (saved) {
          this.placements.update((list) =>
            (list ?? []).map((entry) => (entry.key === saved.key ? saved : entry)),
          );
        }
      });
  }
}
