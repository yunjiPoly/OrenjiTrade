import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import type { InventoryItemResponse } from '@orenji/api-client';
import { CardImageComponent } from '../../../shared/catalog/card-image/card-image.component';
import {
  badgeFreshness,
  formatPrice,
  printingCode,
  printingImageUrl,
} from '../../../shared/inventory/inventory-labels';
import { ItemChipsComponent } from '../../../shared/inventory/item-chips/item-chips.component';
import { FreshnessBadgeComponent } from '../../../shared/ui/freshness-badge/freshness-badge.component';
import { VisibilityBadgeComponent } from '../../../shared/ui/visibility-badge/visibility-badge.component';
import { InventoryRow, QuantityChange, SelectionChange } from './inventory-row';
import { QuantityStepperComponent } from './quantity-stepper.component';

/** Dense table view of the inventory (same data and actions as the grid). */
@Component({
  selector: 'app-inventory-item-table',
  imports: [
    MatCheckboxModule,
    CardImageComponent,
    FreshnessBadgeComponent,
    ItemChipsComponent,
    QuantityStepperComponent,
    VisibilityBadgeComponent,
  ],
  template: `
    <div class="it__scroll">
      <table class="it" aria-label="Your cards">
        <thead>
          <tr>
            <th scope="col" class="it__check">
              <mat-checkbox
                [checked]="allSelected()"
                [indeterminate]="someSelected() && !allSelected()"
                aria-label="Select all cards on this page"
                (change)="toggleAll.emit()"
              />
            </th>
            <th scope="col">Card</th>
            <th scope="col">Condition · availability</th>
            <th scope="col">Quantity</th>
            <th scope="col" class="it__num">Price</th>
            <th scope="col">Visibility</th>
            <th scope="col">Freshness</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.item.id) {
            @let it = row.item;
            <tr [class.it__row--selected]="row.selected" data-testid="inventory-item">
              <td class="it__check">
                <mat-checkbox
                  [checked]="row.selected"
                  [aria-label]="'Select ' + it.card.name"
                  (change)="selectedChange.emit({ id: it.id, selected: $event.checked })"
                />
              </td>
              <td>
                <div class="it__card">
                  <app-card-image class="it__thumb" [src]="imageOf(it)" [game]="it.card.game" />
                  <div class="it__text">
                    <button
                      type="button"
                      class="it__open"
                      [attr.aria-label]="'Edit ' + it.card.name"
                      (click)="edit.emit(it)"
                    >
                      {{ it.card.name }}
                    </button>
                    <span class="it__meta">
                      <span class="mono">{{ codeOf(it) }}</span>
                      @if (it.binder) {
                        · {{ it.binder.name }}
                      }
                    </span>
                  </div>
                </div>
              </td>
              <td>
                <app-item-chips
                  [condition]="it.condition"
                  [availability]="it.availability"
                  [acceptsOffers]="it.acceptsOffers"
                />
              </td>
              <td>
                <app-quantity-stepper
                  [value]="it.quantity"
                  [label]="it.card.name"
                  [disabled]="row.busy"
                  (valueChange)="quantityChange.emit({ item: it, quantity: $event })"
                />
              </td>
              <td class="it__num">{{ priceOf(it) ?? '—' }}</td>
              <td>
                <app-visibility-badge
                  showLabel
                  [visibility]="row.status.visibility"
                  [pending]="row.status.pending"
                  [label]="row.status.label"
                  [note]="row.status.note"
                />
              </td>
              <td>
                <app-freshness-badge [state]="freshnessOf(it)" [label]="it.freshness.label" />
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .it__scroll {
      overflow-x: auto;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .it {
      width: 100%;
      min-width: 880px;
      border-collapse: collapse;
      font-size: var(--font-size-sm);
    }
    th {
      padding: var(--spacing-2) var(--spacing-3);
      border-bottom: 1px solid var(--color-border);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-align: left;
      text-transform: uppercase;
      white-space: nowrap;
    }
    td {
      padding: var(--spacing-2) var(--spacing-3);
      border-bottom: 1px solid var(--color-border);
      vertical-align: middle;
    }
    tbody tr:last-child td {
      border-bottom: 0;
    }
    tbody tr {
      transition: background var(--motion-duration-fast) var(--motion-easing-standard);
    }
    tbody tr:hover {
      background: var(--color-surface-variant);
    }
    .it__row--selected {
      background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
    }
    .it__check {
      width: 48px;
    }
    .it__num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .it__card {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
    }
    .it__thumb {
      flex: 0 0 36px;
      width: 36px;
      --card-image-shadow: none;
    }
    .it__text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .it__open {
      padding: 0;
      border: 0;
      background: none;
      color: var(--color-ink);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      text-align: left;
      cursor: pointer;
    }
    .it__open:hover {
      color: var(--color-primary);
      text-decoration: underline;
    }
    .it__meta {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryItemTableComponent {
  readonly rows = input.required<readonly InventoryRow[]>();
  readonly allSelected = input(false, { transform: booleanAttribute });
  readonly someSelected = input(false, { transform: booleanAttribute });
  readonly edit = output<InventoryItemResponse>();
  readonly selectedChange = output<SelectionChange>();
  readonly toggleAll = output<void>();
  readonly quantityChange = output<QuantityChange>();

  protected imageOf(item: InventoryItemResponse): string | null {
    return item.images[0]?.url ?? printingImageUrl(item.printing);
  }

  protected codeOf(item: InventoryItemResponse): string {
    return printingCode(item.printing);
  }

  protected priceOf(item: InventoryItemResponse): string | null {
    return formatPrice(item.askingPrice, item.currency);
  }

  protected freshnessOf(item: InventoryItemResponse) {
    return badgeFreshness(item.freshness.state);
  }
}
