import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import type { Ad } from '@orenji/api-client';
import { AdImpressionDirective } from './ad-impression.directive';

/**
 * One sponsored ad: always labelled "Sponsored" whatever the API sends (with why it is shown),
 * the advertiser, headline, body and call to action. The whole card links to the API's click
 * route (recorded, then redirected to the landing page in a new tab, `rel="sponsored"`). Emits
 * `seen` once when half of it is visible.
 */
@Component({
  selector: 'app-sponsored-ad',
  imports: [RouterLink, MatIconModule, MatTooltipModule, AdImpressionDirective],
  template: `
    <aside
      class="ad"
      [class.ad--compact]="variant() === 'compact'"
      [attr.aria-label]="'Sponsored: ' + (ad().headline ?? '')"
      data-testid="sponsored-ad"
      [attr.data-placement]="ad().placement"
      appAdImpression
      (adSeen)="seen.emit()"
    >
      <div class="ad__top">
        <span
          class="ad__label"
          data-testid="sponsored-label"
          tabindex="0"
          matTooltip="Sponsored placements match games, your region and your state or province, never your city."
          >Sponsored</span
        >
        @if (removeAdsLink()) {
          <a class="ad__remove" routerLink="/premium">Remove ads</a>
        }
      </div>
      <a
        class="ad__link"
        data-testid="sponsored-link"
        [href]="href()"
        target="_blank"
        rel="sponsored noopener"
      >
        @if (image()) {
          <img class="ad__image" [src]="image()" alt="" loading="lazy" />
        }
        <span class="ad__body">
          @if (ad().advertiser) {
            <span class="ad__advertiser">{{ ad().advertiser }}</span>
          }
          <strong class="ad__headline">{{ ad().headline }}</strong>
          @if (ad().body && variant() !== 'compact') {
            <span class="ad__text">{{ ad().body }}</span>
          }
          @if (ad().ctaLabel) {
            <span class="ad__cta">
              {{ ad().ctaLabel }}
              <mat-icon aria-hidden="true">open_in_new</mat-icon>
            </span>
          }
        </span>
      </a>
    </aside>
  `,
  styles: `
    :host {
      display: block;
    }
    .ad {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      padding: var(--spacing-3) var(--spacing-4) var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--color-surface-variant) 55%, var(--color-surface));
    }
    .ad__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
    }
    .ad__label {
      padding: 1px var(--spacing-2);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-sm);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: help;
    }
    .ad__remove {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .ad__remove:hover {
      color: var(--color-accent);
    }
    .ad__link {
      display: flex;
      gap: var(--spacing-3);
      border-radius: var(--radius-md);
      color: inherit;
      text-decoration: none;
    }
    .ad__link:hover .ad__headline {
      color: var(--color-accent);
      text-decoration: underline;
    }
    .ad__image {
      flex: 0 0 auto;
      width: 64px;
      height: 64px;
      border-radius: var(--radius-md);
      object-fit: cover;
    }
    .ad__body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .ad__advertiser {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .ad__headline {
      font-size: var(--font-size-md);
      line-height: var(--line-height-heading);
    }
    .ad__text {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .ad__cta {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: var(--spacing-1);
      color: var(--color-accent);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .ad__cta mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .ad--compact {
      padding: var(--spacing-2) var(--spacing-3) var(--spacing-3);
    }
    .ad--compact .ad__image {
      width: 44px;
      height: 44px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsoredAdComponent {
  readonly ad = input.required<Ad>();
  /** Resolved click route (see `adClickHref`). */
  readonly href = input.required<string>();
  readonly image = input<string | null>(null);
  readonly variant = input<'card' | 'compact'>('card');
  /** Offer "Remove ads" (to `/premium`) while premium plans are sold. */
  readonly removeAdsLink = input(false);

  readonly seen = output<void>();
}
