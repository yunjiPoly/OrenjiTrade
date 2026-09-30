import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import type { CreditProduct, CreditSpend } from '@orenji/api-client';
import { FEATURE, FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { isApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { ActiveBoostsComponent } from '../../shared/billing/active-boosts.component';
import { creditsLabel, referralProblem } from '../../shared/billing/billing-labels';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { CreditBalanceComponent } from './credit-balance.component';
import { CreditLedgerComponent } from './credit-ledger.component';
import { CreditProductsComponent } from './credit-products.component';
import { CreditsStore } from './data/credits.store';
import { ReferralCardComponent } from './referral-card.component';
import {
  SpendCreditsDialogComponent,
  SpendCreditsDialogData,
} from './spend-credits-dialog.component';

/**
 * `/credits` (members, `credits` flag): OrenjiTrade credits — balance, features to unlock for a
 * day, active boosts, the referral code and redemption, and the append-only history. Credits
 * are never cash: never withdrawable or transferable.
 */
@Component({
  selector: 'app-credits-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    ActiveBoostsComponent,
    CreditBalanceComponent,
    CreditLedgerComponent,
    CreditProductsComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    ReferralCardComponent,
    SkeletonComponent,
  ],
  providers: [CreditsStore],
  template: `
    <div class="page credits">
      <app-page-header
        title="Credits"
        subtitle="Earn credits by inviting collectors and spend them to unlock features for a day."
      >
        @if (premiumEnabled()) {
          <a actions matButton="outlined" routerLink="/premium">
            <mat-icon aria-hidden="true">workspace_premium</mat-icon>
            Premium
          </a>
        }
      </app-page-header>

      @switch (store.status()) {
        @case ('loading') {
          <div class="credits__loading" aria-busy="true">
            <span class="visually-hidden">Loading your credits</span>
            <app-skeleton height="150px" />
            <div class="credits__skeleton-grid">
              <app-skeleton variant="card" />
              <app-skeleton variant="card" />
              <app-skeleton variant="card" />
            </div>
            <app-skeleton variant="list" lines="4" />
          </div>
        }
        @case ('error') {
          <app-error-state
            title="Your credits could not load"
            [message]="errorMessage()"
            [requestId]="store.error()?.requestId ?? null"
            (retry)="store.load()"
          />
        }
        @default {
          <app-credit-balance [balance]="store.balance()" />

          <section class="credits__section" aria-labelledby="unlock-title">
            <h2 id="unlock-title" class="credits__title">Unlock for a day</h2>
            <app-credit-products
              [products]="store.products()"
              [balance]="store.balance()"
              (unlock)="unlock($event)"
            />
          </section>

          <section class="credits__section" aria-labelledby="boosts-title">
            <h2 id="boosts-title" class="credits__title">Active boosts</h2>
            <app-active-boosts
              [entitlements]="store.entitlements()"
              emptyText="Nothing unlocked right now. Unlocks start as soon as you confirm."
            />
          </section>

          <section class="credits__section" aria-labelledby="referral-title">
            <h2 id="referral-title" class="credits__title">Referrals</h2>
            @if (store.referral(); as referral) {
              <app-referral-card
                [referral]="referral"
                [redeeming]="redeeming()"
                [error]="redeemError()"
                (redeem)="redeem($event)"
              />
            } @else if (store.referralError()) {
              <app-error-state
                compact
                title="Your referral code could not load"
                [message]="referralMessage()"
                (retry)="store.loadReferral()"
              />
            } @else {
              <app-skeleton height="140px" />
            }
          </section>

          <section class="credits__section" aria-labelledby="history-title">
            <h2 id="history-title" class="credits__title">History</h2>
            <app-credit-ledger
              [entries]="store.entries()"
              [productNames]="store.productNames()"
              [hasMore]="store.hasMore()"
              [loadingMore]="store.loadingMore()"
              [moreFailed]="store.moreFailed()"
              (loadMore)="store.loadMore()"
            />
          </section>
        }
      }
    </div>
  `,
  styles: `
    .credits {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-8);
    }
    .credits > * {
      max-width: 960px;
    }
    .credits__loading {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-5);
    }
    .credits__skeleton-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
      gap: var(--spacing-4);
    }
    .credits__title {
      margin: 0 0 var(--spacing-3);
      font-size: var(--font-size-xl);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditsPageComponent {
  protected readonly store = inject(CreditsStore);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly flags = inject(FeatureFlagsService);

  protected readonly premiumEnabled = this.flags.enabled(FEATURE.premiumPlans);
  protected readonly redeeming = signal(false);
  protected readonly redeemError = signal<string | null>(null);
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly referralMessage = computed(() => {
    const error = this.store.referralError();
    return error ? friendlyMessage(error) : '';
  });

  constructor() {
    void this.store.load();
  }

  protected unlock(product: CreditProduct): void {
    const data: SpendCreditsDialogData = {
      product,
      balance: this.store.balance(),
      spend: (key, idempotencyKey) => this.store.spend(key, idempotencyKey),
    };
    this.dialog
      .open<SpendCreditsDialogComponent, SpendCreditsDialogData, CreditSpend>(
        SpendCreditsDialogComponent,
        { data, panelClass: 'app-dialog--md' },
      )
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        const until = result.entitlement?.expiresAt
          ? new Date(result.entitlement.expiresAt).toLocaleString('en-CA', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : null;
        this.snackBar.open(
          `${product.name} unlocked${until ? ` until ${until}` : ''}. Balance: ${creditsLabel(result.balance)}.`,
          'OK',
          { duration: 6000 },
        );
      });
  }

  protected async redeem(code: string): Promise<void> {
    this.redeemError.set(null);
    this.redeeming.set(true);
    const result = await this.store.redeem(code);
    this.redeeming.set(false);
    if (isApiError(result)) {
      this.redeemError.set(referralProblem(result));
      return;
    }
    this.snackBar.open(
      `Code redeemed: you earned ${creditsLabel(result.reward)}. Welcome to OrenjiTrade!`,
      'OK',
      { duration: 6000 },
    );
  }
}
