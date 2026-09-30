import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CreditEntry,
  CreditProduct,
  CreditSpend,
  CreditsService,
  MyEntitlement,
  MyReferral,
  PlansService,
  ReferralRedemption,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';

export type CreditsStatus = 'loading' | 'ready' | 'error';

/** Entries per ledger page. */
export const LEDGER_PAGE_SIZE = 20;

/**
 * The member's OrenjiTrade credits on `/credits`: balance, products and the append-only ledger
 * (`GET /me/credits`, cursor pages), the referral code (`GET /me/referrals`), active boosts
 * (`GET /me/plan` entitlements), spending on a product (`POST /me/credits/spend`, idempotent per
 * key) and redeeming a code (`POST /me/referrals/redeem`). Provided by the credits page.
 */
@Injectable()
export class CreditsStore {
  private readonly creditsApi = inject(CreditsService);
  private readonly plansApi = inject(PlansService);

  private readonly statusState = signal<CreditsStatus>('loading');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly balanceState = signal(0);
  private readonly productsState = signal<CreditProduct[]>([]);
  private readonly entriesState = signal<CreditEntry[]>([]);
  private readonly hasMoreState = signal(false);
  private readonly loadingMoreState = signal(false);
  private readonly moreFailedState = signal(false);
  private readonly referralState = signal<MyReferral | null>(null);
  private readonly referralErrorState = signal<ApiError | null>(null);
  private readonly entitlementsState = signal<MyEntitlement[]>([]);

  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly balance = this.balanceState.asReadonly();
  readonly products = this.productsState.asReadonly();
  readonly entries = this.entriesState.asReadonly();
  readonly hasMore = this.hasMoreState.asReadonly();
  readonly loadingMore = this.loadingMoreState.asReadonly();
  readonly moreFailed = this.moreFailedState.asReadonly();
  readonly referral = this.referralState.asReadonly();
  readonly referralError = this.referralErrorState.asReadonly();
  readonly entitlements = this.entitlementsState.asReadonly();
  /** Product names by key, for the ledger ("Wider map for a day"). */
  readonly productNames = computed(() => {
    const names: Record<string, string> = {};
    for (const product of this.productsState()) {
      if (product.key) {
        names[product.key] = product.name ?? product.key;
      }
    }
    return names;
  });

  private nextCursor: string | null = null;
  private generation = 0;

  /** Loads everything (first ledger page with a skeleton, referral, boosts). */
  async load(): Promise<void> {
    this.statusState.set('loading');
    this.errorState.set(null);
    await Promise.all([this.loadFirstPage(), this.loadReferral(), this.loadEntitlements()]);
  }

  /** Quietly re-reads the balance, the first ledger page and the boosts (after a change). */
  async refresh(): Promise<void> {
    await Promise.all([this.loadFirstPage(true), this.loadEntitlements()]);
  }

  async loadMore(): Promise<void> {
    const cursor = this.nextCursor;
    if (!cursor || this.loadingMoreState() || this.statusState() !== 'ready') {
      return;
    }
    const generation = this.generation;
    this.loadingMoreState.set(true);
    this.moreFailedState.set(false);
    try {
      const page = await firstValueFrom(
        this.creditsApi.getMyCredits({ cursor, limit: LEDGER_PAGE_SIZE }, 'body', false, {
          context: silentErrors(),
        }),
      );
      if (generation !== this.generation) {
        return;
      }
      const known = new Set(this.entriesState().map((entry) => entry.id));
      const added = (page.entries?.items ?? []).filter((entry) => !known.has(entry.id));
      this.entriesState.update((entries) => [...entries, ...added]);
      this.setCursor(page.entries?.hasMore, page.entries?.nextCursor);
    } catch {
      this.moreFailedState.set(true);
    } finally {
      this.loadingMoreState.set(false);
    }
  }

  async loadReferral(): Promise<void> {
    this.referralErrorState.set(null);
    try {
      this.referralState.set(
        await firstValueFrom(
          this.creditsApi.getMyReferral('body', false, { context: silentErrors() }),
        ),
      );
    } catch (error) {
      this.referralErrorState.set(toApiError(error));
    }
  }

  /**
   * Spends credits on `productKey` with the dialog's idempotency key (a retry of the same key
   * answers the original result without spending twice). Resolves the result or the error.
   */
  async spend(productKey: string, idempotencyKey: string): Promise<CreditSpend | ApiError> {
    try {
      const result = await firstValueFrom(
        this.creditsApi.spendCredits(
          { creditSpendRequest: { featureKey: productKey, idempotencyKey } },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      if (typeof result.balance === 'number') {
        this.balanceState.set(result.balance);
      }
      void this.refresh();
      return result;
    } catch (error) {
      const apiError = toApiError(error);
      const balance = (apiError.problem as Record<string, unknown> | null)?.['balance'];
      if (apiError.errorCode === 'INSUFFICIENT_CREDITS' && typeof balance === 'number') {
        this.balanceState.set(balance);
      }
      return apiError;
    }
  }

  /** Redeems another member's referral code (case, spaces and dashes are ignored by the API). */
  async redeem(code: string): Promise<ReferralRedemption | ApiError> {
    try {
      const result = await firstValueFrom(
        this.creditsApi.redeemReferralCode(
          { referralRedeemRequest: { code: code.trim() } },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      if (typeof result.balance === 'number') {
        this.balanceState.set(result.balance);
      }
      await Promise.all([this.loadReferral(), this.loadFirstPage(true)]);
      return result;
    } catch (error) {
      return toApiError(error);
    }
  }

  private async loadFirstPage(quiet = false): Promise<void> {
    const generation = ++this.generation;
    try {
      const page = await firstValueFrom(
        this.creditsApi.getMyCredits({ limit: LEDGER_PAGE_SIZE }, 'body', false, {
          context: silentErrors(),
        }),
      );
      if (generation !== this.generation) {
        return;
      }
      this.balanceState.set(page.balance ?? 0);
      this.productsState.set((page.products ?? []).filter((product) => product.active !== false));
      this.entriesState.set(page.entries?.items ?? []);
      this.setCursor(page.entries?.hasMore, page.entries?.nextCursor);
      this.statusState.set('ready');
    } catch (error) {
      if (generation === this.generation && !quiet) {
        this.errorState.set(toApiError(error));
        this.statusState.set('error');
      }
    }
  }

  private async loadEntitlements(): Promise<void> {
    try {
      const plan = await firstValueFrom(
        this.plansApi.getMyPlan('body', false, { context: silentErrors() }),
      );
      this.entitlementsState.set(plan.entitlements ?? []);
    } catch {
      // Optional: the boosts list stays as it was.
    }
  }

  private setCursor(hasMore: boolean | undefined, cursor: string | null | undefined): void {
    this.nextCursor = hasMore && cursor ? cursor : null;
    this.hasMoreState.set(!!this.nextCursor);
  }
}
