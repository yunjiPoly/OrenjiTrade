import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { CardHolderResult } from '@orenji/api-client';
import { editionLabel, languageLabel } from '../../../shared/catalog/catalog-labels';
import { CardImageComponent } from '../../../shared/catalog/card-image/card-image.component';
import { distanceBucketLabel } from '../../../shared/domain/location-labels';
import {
  badgeFreshness,
  formatPrice,
  printingCode,
  printingImageUrl,
} from '../../../shared/inventory/inventory-labels';
import { ItemChipsComponent } from '../../../shared/inventory/item-chips/item-chips.component';
import { MakeOfferButtonComponent } from '../../../shared/offers/make-offer-button.component';
import { offerTargetFromItem, sellerFromMarker } from '../../../shared/offers/offer-target';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { FreshnessBadgeComponent } from '../../../shared/ui/freshness-badge/freshness-badge.component';

/**
 * One "who near me has this card" result: the listed copy (picture, printing, chips, price,
 * freshness, public note) and its holder (approximate place and distance only), with "Make an
 * offer" when the copy accepts offers.
 */
@Component({
  selector: 'app-holder-row',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    AvatarComponent,
    CardImageComponent,
    FreshnessBadgeComponent,
    ItemChipsComponent,
    MakeOfferButtonComponent,
  ],
  template: `
    @let r = result();
    <article class="hr" [attr.aria-label]="r.collector.displayName + ', ' + code()">
      <app-card-image
        class="hr__img"
        [src]="image()"
        [alt]="r.item.card.name"
        [game]="r.item.card.game"
      />
      <div class="hr__item">
        <p class="hr__code mono">{{ code() }}</p>
        <p class="hr__meta">
          {{ r.item.printing.setName }} · {{ language() }} · {{ edition() }}
          @if (r.item.quantity > 1) {
            · ×{{ r.item.quantity }}
          }
        </p>
        <app-item-chips
          [condition]="r.item.condition"
          [availability]="r.item.availability"
          [acceptsOffers]="r.item.acceptsOffers"
        />
        @if (r.item.publicNotes) {
          <p class="hr__note">“{{ r.item.publicNotes }}”</p>
        }
        <app-freshness-badge compact [state]="freshness()" [label]="r.item.freshness.label" />
      </div>
      <div class="hr__side">
        <p class="hr__price" data-testid="holder-price">{{ price() }}</p>
        <div class="hr__owner">
          <app-avatar
            size="sm"
            [src]="r.collector.avatarUrl"
            [name]="r.collector.displayName"
            [decorative]="true"
          />
          <div class="hr__owner-text">
            <a class="hr__owner-name" [routerLink]="['/collectors', r.collector.handle]">{{
              r.collector.displayName
            }}</a>
            <span class="hr__place">
              {{ r.collector.publicLabel }}
              @if (distance(); as distance) {
                · {{ distance }}
              }
            </span>
          </div>
        </div>
        <app-make-offer-button appearance="filled" compact [target]="offerTarget()" />
        @if (r.item.binder; as binder) {
          <a matButton="outlined" class="hr__binder" [routerLink]="['/binders', binder.id]">
            <mat-icon aria-hidden="true">menu_book</mat-icon>
            View binder
          </a>
        }
      </div>
    </article>
  `,
  styles: `
    :host {
      display: block;
    }
    .hr {
      display: grid;
      grid-template-columns: 72px 1fr auto;
      gap: var(--spacing-3) var(--spacing-4);
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      transition: box-shadow var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .hr:hover,
    .hr:focus-within {
      box-shadow: var(--elevation-menu);
    }
    .hr__img {
      width: 72px;
    }
    .hr__item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .hr__code {
      margin: 0;
      font-weight: var(--font-weight-semibold);
    }
    .hr__meta,
    .hr__place {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .hr__note {
      margin: 0;
      font-size: var(--font-size-sm);
      font-style: italic;
    }
    .hr__side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: var(--spacing-2);
      text-align: right;
    }
    .hr__price {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-semibold);
    }
    .hr__owner {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
    }
    .hr__owner-text {
      display: flex;
      flex-direction: column;
    }
    .hr__owner-name {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    @media (max-width: 599px) {
      .hr {
        grid-template-columns: 56px 1fr;
      }
      .hr__img {
        width: 56px;
      }
      .hr__side {
        grid-column: 1 / -1;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        text-align: left;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HolderRowComponent {
  readonly result = input.required<CardHolderResult>();
  readonly signedIn = input(false);

  protected readonly offerTarget = computed(() =>
    offerTargetFromItem(this.result().item, sellerFromMarker(this.result().collector)),
  );
  protected readonly code = computed(() => printingCode(this.result().item.printing));
  protected readonly image = computed(() => printingImageUrl(this.result().item.printing));
  protected readonly language = computed(() => languageLabel(this.result().item.language));
  protected readonly edition = computed(() => editionLabel(this.result().item.edition));
  protected readonly freshness = computed(() => badgeFreshness(this.result().item.freshness.state));
  protected readonly distance = computed(() =>
    this.signedIn() ? distanceBucketLabel(this.result().collector.distanceBucket) : null,
  );
  protected readonly price = computed(() => {
    const item = this.result().item;
    return (
      formatPrice(item.askingPrice, item.currency) ??
      (item.acceptsOffers ? 'Make an offer' : 'No price')
    );
  });
}
