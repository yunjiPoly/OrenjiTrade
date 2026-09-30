import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Ad, AdsService, ListAdsRequestParams } from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { FEATURE, FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { silentErrors } from '../../core/http/http-context';
import { adClickHref, adImageSrc } from './ad-links';
import { AdTrackingService } from './ad-tracking.service';
import { SponsoredAdComponent } from './sponsored-ad.component';

export type AdPlacement = ListAdsRequestParams['placement'];

interface ShownAd {
  ad: Ad;
  href: string;
  image: string | null;
}

/**
 * A sponsored placement (`GET /ads?placement=&game=&geoCell=`): renders the ads the API serves for
 * the viewer, each labelled "Sponsored", records an impression once each is half visible, and
 * links clicks through the API's click route. Renders nothing at all while the `advertising`
 * flag is off, for members without ads (PREMIUM, entitlements: the API answers `[]`), while
 * loading and when the request fails; ads never block or delay the page around them. Reloads
 * when the placement, the game, the signed-in member or their plan changes.
 */
@Component({
  selector: 'app-sponsored-slot',
  imports: [SponsoredAdComponent],
  template: `
    @if (shown().length) {
      <div class="slot" [class.slot--row]="layout() === 'row'" [attr.data-slot]="placement()">
        @for (item of shown(); track item.ad.creativeId) {
          <app-sponsored-ad
            [ad]="item.ad"
            [href]="item.href"
            [image]="item.image"
            [variant]="variant()"
            [removeAdsLink]="premiumPlans()"
            (seen)="tracking.recordImpression(item.ad)"
          />
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    :host:empty {
      display: none;
    }
    .slot {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      animation: slot-in var(--motion-duration-base) var(--motion-easing-standard);
    }
    .slot--row {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    }
    @keyframes slot-in {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .slot {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsoredSlotComponent {
  private readonly api = inject(AdsService);
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly config = inject(AppConfigService);
  private readonly flags = inject(FeatureFlagsService);
  protected readonly tracking = inject(AdTrackingService);

  readonly placement = input.required<AdPlacement>();
  /** Game slug of the surrounding page (targeting); optional. */
  readonly game = input<string | null | undefined>(null);
  readonly variant = input<'card' | 'compact'>('card');
  /** `row` lays several ads side by side (wide placements). */
  readonly layout = input<'stack' | 'row'>('stack');

  protected readonly premiumPlans = this.flags.enabled(FEATURE.premiumPlans);
  private readonly advertising = this.flags.enabled(FEATURE.advertising);
  private readonly ads = signal<Ad[]>([]);
  protected readonly shown = computed<ShownAd[]>(() => {
    const base = this.config.apiBaseUrl();
    const shown: ShownAd[] = [];
    for (const ad of this.ads()) {
      const href = adClickHref(ad.clickUrl, base);
      if (ad.creativeId && ad.headline && href) {
        shown.push({ ad, href, image: adImageSrc(ad.imageUrl, base) });
      }
    }
    return shown;
  });

  private request: Subscription | null = null;
  /** Placement, game, member and plan of the ads on screen (avoids duplicate serves). */
  private servedFor: string | null = null;

  constructor() {
    effect(() => {
      const params: ListAdsRequestParams = { placement: this.placement() };
      const game = this.game();
      if (game) {
        params.game = game;
      }
      const enabled = this.advertising();
      // Identity and plan: a sign-in, a sign-out or an upgrade changes what is served. Wait
      // for the auth state (and a signed-in member's session) so a member never gets the
      // anonymous selection first.
      const authState = this.auth.authState();
      const settled =
        authState === 'anonymous' ||
        (authState === 'authenticated' && this.session.status() !== 'loading');
      const identity = `${this.auth.user()?.uid ?? ''}:${this.session.me()?.plan ?? ''}`;
      untracked(() =>
        this.load(params, enabled && settled, `${JSON.stringify(params)}|${identity}`),
      );
    });
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }

  private load(params: ListAdsRequestParams, enabled: boolean, identity: string): void {
    if (enabled && identity === this.servedFor) {
      return; // already served (or being served) for this placement, member and plan
    }
    this.request?.unsubscribe();
    this.request = null;
    if (!enabled) {
      this.ads.set([]);
      this.servedFor = null;
      return;
    }
    this.servedFor = identity;
    this.request = this.api.listAds(params, 'body', false, { context: silentErrors() }).subscribe({
      next: (ads) => this.ads.set(Array.isArray(ads) ? ads : []),
      error: () => {
        this.ads.set([]);
        this.servedFor = null;
      },
    });
  }
}
