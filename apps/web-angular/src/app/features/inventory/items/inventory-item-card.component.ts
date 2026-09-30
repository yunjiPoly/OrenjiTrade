import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import type { InventoryItemResponse } from '@orenji/api-client';
import { CardImageComponent } from '../../../shared/catalog/card-image/card-image.component';
import { gameInfo } from '../../../shared/domain/games';
import {
  badgeFreshness,
  formatPrice,
  printingCode,
  printingImageUrl,
} from '../../../shared/inventory/inventory-labels';
import { ItemChipsComponent } from '../../../shared/inventory/item-chips/item-chips.component';
import { FreshnessBadgeComponent } from '../../../shared/ui/freshness-badge/freshness-badge.component';
import { VisibilityBadgeComponent } from '../../../shared/ui/visibility-badge/visibility-badge.component';
import { VisibilityStatus } from '../data/visibility-status';
import { QuantityStepperComponent } from './quantity-stepper.component';

/**
 * One owned card in the inventory grid: selection checkbox, picture, name (opens the editor; the
 * whole card is clickable), printing code, chips, price, quantity stepper, visibility and
 * freshness.
 */
@Component({
  selector: 'app-inventory-item-card',
  imports: [
    MatCheckboxModule,
    CardImageComponent,
    FreshnessBadgeComponent,
    ItemChipsComponent,
    QuantityStepperComponent,
    VisibilityBadgeComponent,
  ],
  template: `
    @let it = item();
    <article
      class="ic"
      [class.ic--selected]="selected()"
      [class.ic--stale]="freshness() === 'stale' || freshness() === 'hidden'"
      [style.--ic-accent]="accent()"
      [attr.aria-label]="it.card.name"
      data-testid="inventory-item"
    >
      <div class="ic__media">
        <app-card-image [src]="image()" [alt]="''" [game]="it.card.game" />
        <mat-checkbox
          class="ic__select ic__above"
          [checked]="selected()"
          [aria-label]="'Select ' + it.card.name"
          (change)="selectedChange.emit($event.checked)"
        />
        <app-visibility-badge
          class="ic__visibility ic__above"
          [visibility]="status().visibility"
          [pending]="status().pending"
          [label]="status().label"
          [note]="status().note"
        />
      </div>
      <div class="ic__body">
        <h3 class="ic__name">
          <button
            type="button"
            class="ic__open"
            [attr.aria-label]="'Edit ' + it.card.name"
            (click)="edit.emit()"
          >
            {{ it.card.name }}
          </button>
        </h3>
        <p class="ic__meta">
          <span class="mono">{{ code() }}</span>
          @if (it.binder) {
            · {{ it.binder.name }}
          }
        </p>
        <app-item-chips
          [condition]="it.condition"
          [availability]="it.availability"
          [acceptsOffers]="it.acceptsOffers"
        />
        <div class="ic__row">
          <span class="ic__price" [class.ic__price--none]="!price()">{{
            price() ?? 'No price'
          }}</span>
          <app-quantity-stepper
            class="ic__above"
            [value]="it.quantity"
            [label]="it.card.name"
            [disabled]="busy()"
            (valueChange)="quantityChange.emit($event)"
          />
        </div>
        <app-freshness-badge
          class="ic__fresh"
          compact
          [state]="freshness()"
          [label]="it.freshness.label"
        />
      </div>
    </article>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .ic {
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      transition:
        transform var(--motion-duration-fast) var(--motion-easing-standard),
        box-shadow var(--motion-duration-fast) var(--motion-easing-standard),
        border-color var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .ic:hover {
      transform: translateY(-2px);
      box-shadow: var(--elevation-menu);
    }
    .ic--selected {
      border-color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
      box-shadow: 0 0 0 1px var(--color-primary);
    }
    .ic__media {
      position: relative;
      margin-bottom: var(--spacing-3);
    }
    .ic--stale .ic__media app-card-image {
      filter: saturate(0.55);
    }
    .ic__above {
      position: relative;
      z-index: 1;
    }
    .ic__select {
      position: absolute;
      top: -4px;
      left: -4px;
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-surface) 88%, transparent);
    }
    .ic__visibility {
      position: absolute;
      top: 6px;
      right: 6px;
    }
    .ic__body {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .ic__name {
      font-family: var(--font-body);
      font-size: var(--font-size-md);
      line-height: 1.3;
    }
    .ic__open {
      padding: 0;
      border: 0;
      background: none;
      color: var(--color-ink);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      text-align: left;
      cursor: pointer;
    }
    .ic__open::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: var(--radius-lg);
    }
    .ic__open:focus-visible {
      outline: none;
    }
    .ic__open:focus-visible::after {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
    .ic__meta {
      margin: 0;
      overflow: hidden;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ic__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
      margin-top: auto;
      padding-top: var(--spacing-1);
    }
    .ic__price {
      font-weight: var(--font-weight-semibold);
    }
    .ic__price--none {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-regular);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryItemCardComponent {
  readonly item = input.required<InventoryItemResponse>();
  readonly status = input.required<VisibilityStatus>();
  readonly selected = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });
  readonly edit = output<void>();
  readonly selectedChange = output<boolean>();
  readonly quantityChange = output<number>();

  protected readonly image = computed(
    () => this.item().images[0]?.url ?? printingImageUrl(this.item().printing),
  );
  protected readonly code = computed(() => printingCode(this.item().printing));
  protected readonly price = computed(() =>
    formatPrice(this.item().askingPrice, this.item().currency),
  );
  protected readonly freshness = computed(() => badgeFreshness(this.item().freshness.state));
  protected readonly accent = computed(() => `var(${gameInfo(this.item().card.game).colorVar})`);
}
