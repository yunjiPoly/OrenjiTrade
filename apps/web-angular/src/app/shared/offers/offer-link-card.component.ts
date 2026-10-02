import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { OfferLink } from '@orenji/api-client';
import { CardImageComponent } from '../ui/card-image/card-image.component';
import { offerStatusInfo } from './offer-labels';
import { StatusChipComponent } from './status-chip.component';

/**
 * An offer shared in a conversation (OFFER_LINK message, or the SYSTEM message the API posts on
 * every offer transition): the offered card's picture (with an offer badge; the offer icon when the
 * API sent none), the live proposal's summary and status, linking to the offer page.
 */
@Component({
  selector: 'app-offer-link-card',
  imports: [RouterLink, MatIconModule, CardImageComponent, StatusChipComponent],
  template: `
    @let o = offer();
    <a
      class="olc"
      [routerLink]="['/offers', o.id]"
      [attr.aria-label]="'Open the offer: ' + o.summary + ', ' + status().label"
      data-testid="offer-link-card"
    >
      @if (o.imageUrl) {
        <!-- Decorative: the link's label already names the offer and its card. -->
        <span class="olc__card" data-testid="offer-link-card-image">
          <app-card-image size="xs" [src]="o.imageUrl" alt="" />
          <span class="olc__badge" aria-hidden="true"><mat-icon>local_offer</mat-icon></span>
        </span>
      } @else {
        <span class="olc__icon" aria-hidden="true"><mat-icon>local_offer</mat-icon></span>
      }
      <span class="olc__text">
        <span class="olc__eyebrow">Offer</span>
        <span class="olc__summary">{{ o.summary }}</span>
      </span>
      <app-status-chip [label]="status().label" [icon]="status().icon" [tone]="status().tone" />
      <mat-icon class="olc__go" aria-hidden="true">chevron_right</mat-icon>
    </a>
  `,
  styles: `
    :host {
      display: block;
    }
    .olc {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-2) var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-ink);
      text-decoration: none;
      transition:
        border-color var(--motion-duration-fast) var(--motion-easing-standard),
        box-shadow var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .olc:hover {
      border-color: var(--color-availability-offers);
      box-shadow: var(--elevation-floating);
    }
    .olc__icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--color-availability-offers) 16%, var(--color-surface));
      color: var(--color-availability-offers);
    }
    .olc__card {
      position: relative;
      flex: 0 0 auto;
      width: 36px;
    }
    .olc__card app-card-image {
      --card-image-width: 36px;
    }
    .olc__badge {
      position: absolute;
      right: -6px;
      bottom: -4px;
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      border: 2px solid var(--color-surface);
      border-radius: 50%;
      background: color-mix(in srgb, var(--color-availability-offers) 16%, var(--color-surface));
      color: var(--color-availability-offers);
    }
    .olc__badge mat-icon {
      margin: 0;
      font-size: 12px;
      width: 12px;
      height: 12px;
    }
    .olc__text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
    }
    .olc__eyebrow {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .olc__summary {
      overflow-wrap: anywhere;
      font-weight: var(--font-weight-semibold);
    }
    .olc__go {
      flex: 0 0 auto;
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferLinkCardComponent {
  readonly offer = input.required<OfferLink>();
  protected readonly status = computed(() => offerStatusInfo(this.offer().status));
}
