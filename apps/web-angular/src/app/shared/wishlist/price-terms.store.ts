import { Injectable, inject, signal } from '@angular/core';
import { WishPriceTerm, WishlistService } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { silentErrors } from '../../core/http/http-context';

/**
 * The price terms a wish may choose (`GET /wishlist/price-terms`, admin-configured: "80% TCG" …
 * "100% TCG+"). Loaded once per session on first use; a failed load is retried on the next use.
 */
@Injectable({ providedIn: 'root' })
export class PriceTermsStore {
  private readonly api = inject(WishlistService);

  private readonly termsState = signal<readonly WishPriceTerm[]>([]);
  private readonly statusState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  private pending: Promise<void> | null = null;

  readonly terms = this.termsState.asReadonly();
  readonly status = this.statusState.asReadonly();

  load(): Promise<void> {
    if (this.statusState() === 'ready') {
      return Promise.resolve();
    }
    this.pending ??= this.fetch();
    return this.pending;
  }

  private async fetch(): Promise<void> {
    this.statusState.set('loading');
    try {
      const response = await firstValueFrom(
        this.api.listWishPriceTerms('body', false, { context: silentErrors() }),
      );
      this.termsState.set(response.terms ?? []);
      this.statusState.set('ready');
    } catch {
      this.statusState.set('error');
    } finally {
      this.pending = null;
    }
  }
}
