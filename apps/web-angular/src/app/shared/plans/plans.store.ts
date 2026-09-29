import { Injectable, computed, inject, signal } from '@angular/core';
import { Plan, PlansService } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../core/http/api-error';
import { silentErrors } from '../../core/http/http-context';

/**
 * Public plans (`GET /api/v1/plans`), loaded on first use and shared by the premium page and the
 * limit-reached dialog. Values are live data edited in the admin console: nothing here hard-codes
 * a limit.
 */
@Injectable({ providedIn: 'root' })
export class PlansStore {
  private readonly api = inject(PlansService);
  private readonly plansState = signal<Plan[] | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<ApiError | null>(null);
  private inflight: Promise<Plan[] | null> | null = null;

  readonly plans = this.plansState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** The first paid plan (display order), used to describe the premium benefit. */
  readonly premium = computed(
    () => this.plansState()?.find((plan) => plan.code === 'PREMIUM') ?? null,
  );

  /** Loads once (or again with `force`); never rejects, returns `null` on failure. */
  load(force = false): Promise<Plan[] | null> {
    if (!force && this.plansState()) {
      return Promise.resolve(this.plansState());
    }
    if (this.inflight) {
      return this.inflight;
    }
    this.loadingState.set(true);
    this.errorState.set(null);
    const request = firstValueFrom(this.api.listPlans('body', false, { context: silentErrors() }))
      .then((plans) => {
        this.plansState.set(plans ?? []);
        return this.plansState();
      })
      .catch((error: unknown) => {
        this.errorState.set(toApiError(error));
        return null;
      })
      .finally(() => {
        this.loadingState.set(false);
        this.inflight = null;
      });
    this.inflight = request;
    return request;
  }

  /** Description of a limit key from the plans ("Public binder views per day"). */
  limitDescription(key: string): string | null {
    for (const plan of this.plansState() ?? []) {
      const limit = plan.limits?.find((entry) => entry.key === key);
      if (limit?.description) {
        return limit.description;
      }
    }
    return null;
  }
}
