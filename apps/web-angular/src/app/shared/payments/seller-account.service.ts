import { Injectable, computed, inject, signal } from '@angular/core';
import { PaymentsService, SellerAccount, SellerOnboarding } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../core/http/api-error';
import { silentErrors } from '../../core/http/http-context';

export type SellerAccountLoad = 'idle' | 'loading' | 'ready' | 'disabled' | 'error';

/**
 * The signed-in collector's payout account (`GET /me/seller-account`,
 * `POST /me/seller-account/onboarding`): read by Settings → Payouts and by a seller's trade page
 * while a protected trade waits for a payment. `disabled` means the `protectedPayments` flag is
 * off for the collector (404 FEATURE_DISABLED). No bank details ever reach OrenjiTrade: the
 * provider hosts the onboarding (the local fake provider activates the account at once).
 */
@Injectable({ providedIn: 'root' })
export class SellerAccountService {
  private readonly api = inject(PaymentsService);

  private readonly accountState = signal<SellerAccount | null>(null);
  private readonly loadState = signal<SellerAccountLoad>('idle');
  private readonly errorState = signal<ApiError | null>(null);

  readonly account = this.accountState.asReadonly();
  readonly status = this.loadState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** Payouts can be received (buyers can pay protected trades). */
  readonly ready = computed(() => this.accountState()?.ready === true);

  async load(): Promise<SellerAccount | null> {
    this.loadState.set('loading');
    this.errorState.set(null);
    try {
      const account = await firstValueFrom(
        this.api.getSellerAccount('body', false, { context: silentErrors() }),
      );
      this.accountState.set(account);
      this.loadState.set('ready');
      return account;
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.errorCode === 'FEATURE_DISABLED') {
        this.accountState.set(null);
        this.loadState.set('disabled');
      } else {
        this.errorState.set(apiError);
        this.loadState.set('error');
      }
      return null;
    }
  }

  /**
   * Starts (or resumes) the onboarding; resolves where to continue (`url`: a web path with the
   * fake provider, the provider's hosted page otherwise). Throws the {@link ApiError}.
   */
  async startOnboarding(returnUrl: string): Promise<SellerOnboarding> {
    try {
      const onboarding = await firstValueFrom(
        this.api.startSellerOnboarding({ sellerOnboardingRequest: { returnUrl } }, 'body', false, {
          context: silentErrors(),
        }),
      );
      this.accountState.set(onboarding.account);
      this.loadState.set('ready');
      return onboarding;
    } catch (error) {
      throw toApiError(error);
    }
  }
}
