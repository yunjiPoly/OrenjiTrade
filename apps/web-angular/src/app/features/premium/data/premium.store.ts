import { Injectable, computed, inject, signal } from '@angular/core';
import { MyPlan, MySubscription, PlansService, SubscriptionsService } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import { checkoutProblem, checkoutTarget } from '../../../shared/billing/billing-labels';

export type CheckoutStart =
  | { ok: true; target: NonNullable<ReturnType<typeof checkoutTarget>>; resumed: boolean }
  | { ok: false; message: string; alreadySubscribed: boolean };

/**
 * The signed-in member's plan on `/premium`: `GET /me/plan` (plan, usage, entitlements and the
 * live subscription), starting a subscription checkout (`POST /me/subscription/checkout`) and
 * cancelling (`POST /me/subscription/cancel`, at the period end or at once). Provided by the
 * premium page.
 */
@Injectable()
export class PremiumStore {
  private readonly plansApi = inject(PlansService);
  private readonly subscriptionsApi = inject(SubscriptionsService);

  private readonly myPlanState = signal<MyPlan | null>(null);
  private readonly errorState = signal<ApiError | null>(null);
  private readonly loadingState = signal(false);
  private readonly busyState = signal<'checkout' | 'cancel' | null>(null);

  readonly myPlan = this.myPlanState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly busy = this.busyState.asReadonly();
  readonly subscription = computed<MySubscription | null>(
    () => this.myPlanState()?.subscription ?? null,
  );
  readonly planCode = computed(() => this.myPlanState()?.plan?.code ?? null);

  async load(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      this.myPlanState.set(
        await firstValueFrom(this.plansApi.getMyPlan('body', false, { context: silentErrors() })),
      );
    } catch (error) {
      this.errorState.set(toApiError(error));
    } finally {
      this.loadingState.set(false);
    }
  }

  clear(): void {
    this.myPlanState.set(null);
    this.errorState.set(null);
  }

  /** Opens (or resumes) a checkout for `planCode` and says where to pay. */
  async startCheckout(planCode: string): Promise<CheckoutStart> {
    if (this.busyState()) {
      return { ok: false, message: 'Please wait a moment.', alreadySubscribed: false };
    }
    this.busyState.set('checkout');
    try {
      const answer = await firstValueFrom(
        this.subscriptionsApi.startSubscriptionCheckout(
          { subscriptionCheckoutRequest: { planCode } },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      const target = checkoutTarget(answer.url ?? answer.subscription?.checkoutUrl);
      if (!target) {
        return {
          ok: false,
          message: 'The billing provider did not return a checkout page. Please try again later.',
          alreadySubscribed: false,
        };
      }
      return { ok: true, target, resumed: !!answer.resumed };
    } catch (error) {
      const apiError = toApiError(error);
      const alreadySubscribed = apiError.errorCode === 'ALREADY_SUBSCRIBED';
      if (alreadySubscribed) {
        void this.load();
      }
      return { ok: false, message: checkoutProblem(apiError), alreadySubscribed };
    } finally {
      this.busyState.set(null);
    }
  }

  /**
   * Cancels the live subscription: at the period end (the plan stays until then) or at once (the
   * free plan applies now). Also abandons an open checkout. Resolves the new state or the error.
   */
  async cancel(atPeriodEnd: boolean): Promise<MySubscription | ApiError> {
    this.busyState.set('cancel');
    try {
      const subscription = await firstValueFrom(
        this.subscriptionsApi.cancelSubscription(
          { subscriptionCancelRequest: { atPeriodEnd } },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      await this.load();
      return subscription;
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.status === 404) {
        await this.load();
      }
      return apiError;
    } finally {
      this.busyState.set(null);
    }
  }
}
