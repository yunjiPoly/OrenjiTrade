import { Injectable, inject, signal } from '@angular/core';
import {
  Donation,
  DonationCheckout,
  DonationCheckoutRequest,
  DonationsService,
  Supporters,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';

/** Supporters shown on the page. */
export const SUPPORTERS_LIMIT = 30;

/**
 * `/support`: the public supporters list (`GET /public/donations/supporters`, opt-in display
 * names only), the member's own donations (`GET /me/donations`) and starting a voluntary
 * donation (`POST /donations/checkout`). Provided by the support page.
 */
@Injectable()
export class SupportStore {
  private readonly api = inject(DonationsService);

  private readonly supportersState = signal<Supporters | null>(null);
  private readonly supportersErrorState = signal<ApiError | null>(null);
  private readonly mineState = signal<Donation[] | null>(null);
  private readonly mineErrorState = signal<ApiError | null>(null);

  readonly supporters = this.supportersState.asReadonly();
  readonly supportersError = this.supportersErrorState.asReadonly();
  readonly mine = this.mineState.asReadonly();
  readonly mineError = this.mineErrorState.asReadonly();

  async loadSupporters(): Promise<void> {
    this.supportersErrorState.set(null);
    try {
      this.supportersState.set(
        await firstValueFrom(
          this.api.listSupporters({ limit: SUPPORTERS_LIMIT }, 'body', false, {
            context: silentErrors(),
          }),
        ),
      );
    } catch (error) {
      this.supportersErrorState.set(toApiError(error));
    }
  }

  async loadMine(): Promise<void> {
    this.mineErrorState.set(null);
    try {
      this.mineState.set(
        (await firstValueFrom(
          this.api.listMyDonations('body', false, { context: silentErrors() }),
        )) ?? [],
      );
    } catch (error) {
      this.mineErrorState.set(toApiError(error));
    }
  }

  clearMine(): void {
    this.mineState.set(null);
    this.mineErrorState.set(null);
  }

  /** Opens a donation checkout; resolves where to pay or the refusal. */
  async startCheckout(request: DonationCheckoutRequest): Promise<DonationCheckout | ApiError> {
    try {
      return await firstValueFrom(
        this.api.startDonationCheckout({ donationCheckoutRequest: request }, 'body', false, {
          context: silentErrors(),
        }),
      );
    } catch (error) {
      return toApiError(error);
    }
  }
}
