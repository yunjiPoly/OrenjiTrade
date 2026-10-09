import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PrintingSummary } from '@orenji/api-client';
import {
  editionLabel,
  finishLabel,
  formatMarketPrice,
  languageLabel,
} from '../../../shared/catalog/catalog-labels';
import { printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';

/**
 * Printings as a table. `card` mode (card detail) links each set and lets the collector pick the
 * printing shown in the hero (`selectedRarity` highlights every printing of "any printing in a
 * rarity"); `set` mode (set checklist) links each card instead.
 */
@Component({
  selector: 'app-printings-table',
  imports: [CardImageComponent, DatePipe, RouterLink],
  template: `
    <div class="wrap" tabindex="0" role="region" [attr.aria-label]="label() + ' (scrollable)'">
      <table class="printings" [attr.aria-label]="label()">
        <thead>
          <tr>
            <th scope="col" class="printings__pic"><span class="visually-hidden">Picture</span></th>
            @if (mode() === 'set') {
              <th scope="col">No.</th>
              <th scope="col">Card</th>
            } @else {
              <th scope="col">Set</th>
              <th scope="col">No.</th>
            }
            <th scope="col">Code</th>
            <th scope="col">Rarity</th>
            <th scope="col">Edition</th>
            <th scope="col">Language</th>
            <th scope="col">Finish</th>
            <th scope="col" class="printings__num">Market price</th>
          </tr>
        </thead>
        <tbody>
          @for (printing of printings(); track printing.id) {
            @let selected = mode() === 'card' && printing.id === selectedId();
            @let inRarity =
              mode() === 'card' && !!selectedRarity() && printing.rarity === selectedRarity();
            <tr
              [class.printings__row--selected]="selected || inRarity"
              [attr.aria-current]="selected || null"
            >
              <td class="printings__pic">
                <app-card-image
                  class="printings__thumb"
                  size="xs"
                  [src]="image(printing)"
                  [alt]="mode() === 'set' ? nameOf(printing) : cardName()"
                  [game]="game()"
                />
              </td>
              @if (mode() === 'set') {
                <td class="mono">{{ printing.collectorNumber }}</td>
                <td>
                  <a
                    class="printings__card"
                    [routerLink]="['/cards', printing.cardId]"
                    [queryParams]="{ printing: printing.id }"
                  >
                    {{ nameOf(printing) }}
                  </a>
                </td>
              } @else {
                <td>
                  <a class="printings__set" [routerLink]="['/sets', printing.setId]">
                    <span class="printings__set-code">{{ printing.setCode }}</span>
                    {{ printing.setName }}
                  </a>
                </td>
                <td class="mono">{{ printing.collectorNumber }}</td>
              }
              <td>
                @if (mode() === 'card') {
                  <button
                    type="button"
                    class="printings__pick mono"
                    [attr.aria-pressed]="selected"
                    [attr.aria-label]="
                      'Show printing ' + (printing.printingCode ?? printing.collectorNumber)
                    "
                    (click)="pick.emit(printing.id ?? '')"
                  >
                    {{ printing.printingCode || '—' }}
                  </button>
                } @else {
                  <span class="mono">{{ printing.printingCode || '—' }}</span>
                }
              </td>
              <td>
                <span class="printings__rarity">{{ printing.rarity || '—' }}</span>
              </td>
              <td>{{ edition(printing.edition) }}</td>
              <td>{{ language(printing.language) }}</td>
              <td>{{ finish(printing.finish) }}</td>
              <td class="printings__num">
                @if (price(printing); as amount) {
                  <span class="printings__price">{{ amount }}</span>
                  @if (printing.marketPrice?.updatedAt; as updatedAt) {
                    <span class="printings__asof">{{
                      updatedAt | date: 'mediumDate' : 'UTC'
                    }}</span>
                  }
                } @else {
                  <span class="printings__none">—</span>
                }
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
    .wrap {
      overflow-x: auto;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .printings {
      width: 100%;
      min-width: 720px;
      border-collapse: collapse;
      font-size: var(--font-size-sm);
    }
    th,
    td {
      padding: var(--spacing-2) var(--spacing-3);
      vertical-align: middle;
      border-bottom: 1px solid var(--color-border);
      text-align: left;
      white-space: nowrap;
    }
    th {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      background: var(--color-surface-variant);
    }
    tbody tr:last-child td {
      border-bottom: 0;
    }
    tbody tr {
      transition: background var(--motion-duration-fast) var(--motion-easing-standard);
    }
    tbody tr:hover {
      background: color-mix(in srgb, var(--color-primary) 5%, transparent);
    }
    .printings__row--selected,
    .printings__row--selected:hover {
      background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    }
    .printings__num {
      text-align: right;
    }
    .printings__pic {
      width: 36px;
      padding-right: 0;
    }
    .printings__thumb {
      --card-image-shadow: none;
    }
    .printings__set,
    .printings__card {
      color: var(--color-ink);
      font-weight: var(--font-weight-medium);
      text-decoration: none;
    }
    .printings__set:hover,
    .printings__card:hover {
      color: var(--color-primary);
      text-decoration: underline;
    }
    .printings__set-code {
      display: inline-block;
      margin-right: var(--spacing-1);
      padding: 0 6px;
      border-radius: var(--radius-sm);
      background: var(--color-surface-variant);
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
    }
    .printings__pick {
      padding: 2px var(--spacing-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-ink);
      cursor: pointer;
    }
    .printings__pick[aria-pressed='true'] {
      border-color: var(--color-primary);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
    }
    .printings__rarity {
      font-weight: var(--font-weight-medium);
    }
    .printings__price {
      font-weight: var(--font-weight-semibold);
    }
    .printings__asof {
      display: block;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .printings__none {
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrintingsTableComponent {
  readonly printings = input.required<readonly PrintingSummary[]>();
  readonly mode = input<'card' | 'set'>('card');
  readonly label = input('Printings');
  readonly selectedId = input<string | null>(null);
  /** `card` mode: "any printing in this rarity" (rows of that rarity are highlighted). */
  readonly selectedRarity = input<string | null>(null);
  /** `set` mode: card names by card id. */
  readonly cardNames = input<Readonly<Record<string, string>>>({});
  /** `card` mode: the card's name (picture alt text). */
  readonly cardName = input('');
  /** Game slug tinting the placeholder pictures. */
  readonly game = input<string | null | undefined>('');
  readonly pick = output<string>();

  protected readonly edition = editionLabel;
  protected readonly finish = finishLabel;
  protected readonly language = languageLabel;

  protected nameOf(printing: PrintingSummary): string {
    const names: Readonly<Record<string, string | undefined>> = this.cardNames();
    return names[printing.cardId ?? ''] ?? printing.printingCode ?? 'Card';
  }

  /** The printing's front picture (an API URL; the placeholder art when missing). */
  protected image(printing: PrintingSummary): string | null {
    return printingImageUrl(printing);
  }

  protected price(printing: PrintingSummary): string | null {
    return formatMarketPrice(printing.marketPrice);
  }
}
