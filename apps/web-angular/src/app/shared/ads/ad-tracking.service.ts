import { Injectable, inject } from '@angular/core';
import { Ad, AdsService } from '@orenji/api-client';
import { silentErrors } from '../../core/http/http-context';

/**
 * Records ad impressions (`POST /ads/{creativeId}/impression` with the serve token), once per
 * served ad: the API also deduplicates per token, this only avoids pointless requests when a
 * slot scrolls in and out of view. Failures are ignored (an impression is best effort).
 */
@Injectable({ providedIn: 'root' })
export class AdTrackingService {
  private readonly api = inject(AdsService);
  private readonly recorded = new Set<string>();

  recordImpression(ad: Ad): void {
    const token = ad.impressionToken;
    if (!ad.creativeId || !token || this.recorded.has(token)) {
      return;
    }
    this.recorded.add(token);
    this.api
      .recordAdImpression(
        { creativeId: ad.creativeId, adImpressionRequest: { token } },
        'body',
        false,
        { context: silentErrors() },
      )
      .subscribe({ error: () => undefined });
  }
}
