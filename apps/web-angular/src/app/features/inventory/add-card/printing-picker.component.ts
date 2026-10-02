import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { MatRadioModule } from '@angular/material/radio';
import type { PrintingSummary } from '@orenji/api-client';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import {
  editionLabel,
  finishLabel,
  formatMarketPrice,
  languageLabel,
} from '../../../shared/catalog/catalog-labels';
import { printingCode, printingImageUrl } from '../../../shared/inventory/inventory-labels';

/** Radio list of a card's printings (picture, code, set, rarity, edition, language, price). */
@Component({
  selector: 'app-printing-picker',
  imports: [MatRadioModule, CardImageComponent],
  template: `
    <mat-radio-group
      class="pp"
      aria-label="Printing"
      [value]="selected()"
      (change)="selected.set($event.value)"
    >
      @for (printing of printings(); track printing.id) {
        <mat-radio-button
          class="pp__option"
          [class.pp__option--selected]="selected() === printing.id"
          [value]="printing.id"
        >
          <span class="pp__row">
            <app-card-image class="pp__img" [src]="imageOf(printing)" [game]="game()" />
            <span class="pp__text">
              <span class="pp__code mono">{{ codeOf(printing) }}</span>
              <span class="pp__set">{{ printing.setName }}</span>
              <span class="pp__meta">{{ describe(printing) }}</span>
              @if (priceOf(printing); as price) {
                <span class="pp__price">Market {{ price }}</span>
              }
            </span>
          </span>
        </mat-radio-button>
      }
    </mat-radio-group>
  `,
  styles: `
    :host {
      display: block;
    }
    .pp {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: var(--spacing-2);
    }
    .pp__option {
      padding: var(--spacing-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      transition: border-color var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .pp__option--selected {
      border-color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
    }
    .pp__row {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
    }
    .pp__img {
      flex: 0 0 48px;
      width: 48px;
      --card-image-shadow: none;
    }
    .pp__text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      font-size: var(--font-size-sm);
    }
    .pp__code {
      font-weight: var(--font-weight-semibold);
    }
    .pp__set,
    .pp__meta {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .pp__price {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrintingPickerComponent {
  readonly printings = input.required<readonly PrintingSummary[]>();
  readonly game = input('');
  /** Selected printing id (two-way). */
  readonly selected = model<string | null>(null);

  protected imageOf(printing: PrintingSummary): string | null {
    return printingImageUrl(printing);
  }

  protected codeOf(printing: PrintingSummary): string {
    return printingCode(printing);
  }

  protected priceOf(printing: PrintingSummary): string | null {
    return formatMarketPrice(printing.marketPrice);
  }

  protected describe(printing: PrintingSummary): string {
    return [
      printing.rarity,
      editionLabel(printing.edition),
      languageLabel(printing.language),
      finishLabel(printing.finish),
    ]
      .filter((part) => part && part !== '—')
      .join(' · ');
  }
}
