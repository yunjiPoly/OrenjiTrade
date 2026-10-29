import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  InjectionToken,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { PrintingSummary } from '@orenji/api-client';
import { PopoverRef } from '../../../core/layout/popover/popover.service';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { PrintingSelection } from '../../../shared/catalog/printing-picker/printing-selection';
import { printingCode } from '../../../shared/inventory/inventory-labels';
import { specialEdition, specialFinish } from '../../../shared/wishlist/wishlist-labels';

/** What the card page hands its printing picker. */
export interface PrintingPopoverData {
  printings: readonly PrintingSummary[];
  selection: PrintingSelection;
  pick: (selection: PrintingSelection) => void;
}

export const PRINTING_POPOVER_DATA = new InjectionToken<PrintingPopoverData>('PrintingPopoverData');

/**
 * "LAVD-EN008 · Legendary Arc-V Decks · 2017 · Ultra Rare" (spec 7.3; no counts), with "1st
 * Edition" or a finish when the printing is not the usual one: two printings of one code can
 * differ only by them.
 */
export function printingRowLabel(printing: PrintingSummary): string {
  const year = printing.setReleaseDate ? printing.setReleaseDate.slice(0, 4) : null;
  return [
    printingCode(printing),
    printing.setName,
    year,
    printing.rarity,
    specialEdition(printing.edition),
    specialFinish(printing.finish),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The printings a filter text and a rarity chip leave, in the catalogue's order. */
export function filterPrintings(
  printings: readonly PrintingSummary[],
  text: string,
  rarity: string | null,
): PrintingSummary[] {
  const needle = text.trim().toLowerCase();
  return printings.filter((printing) => {
    if (rarity && printing.rarity !== rarity) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return [printingCode(printing), printing.setCode, printing.setName]
      .filter(Boolean)
      .some((value) => (value as string).toLowerCase().includes(needle));
  });
}

/**
 * The card page's "Any printing ▾" listbox (spec 7.3, board W7; 400, anchored): a filter field
 * "Set code or set name", rarity chips, "Any printing" and one row per printing ("LAVD-EN008 ·
 * Legendary Arc-V Decks · 2017 · Ultra Rare"). No counts. ↑↓ move, Enter or a click picks and
 * closes, Esc closes; the focus returns to the pill.
 */
@Component({
  selector: 'app-printing-popover',
  imports: [ShellIconComponent],
  template: `
    <div class="pp" role="dialog" aria-modal="true" aria-labelledby="pp-title">
      <h2 class="pp__title" id="pp-title">Which printing</h2>
      <label class="pp__field">
        <app-shell-icon class="pp__muted" name="search" [size]="18" />
        <input
          #filter
          class="pp__input"
          type="search"
          autocomplete="off"
          maxlength="60"
          placeholder="Set code or set name"
          aria-label="Set code or set name"
          aria-controls="pp-list"
          (input)="text.set(filter.value)"
          (keydown)="onFieldKey($event)"
        />
      </label>
      @if (rarities().length > 1) {
        <div class="pp__chips" role="group" aria-label="Rarity">
          @for (value of rarities(); track value) {
            <button
              type="button"
              class="pp__chip"
              [attr.aria-pressed]="rarity() === value"
              (click)="toggleRarity(value)"
            >
              {{ value }}
            </button>
          }
        </div>
      }
      <div
        class="pp__list"
        id="pp-list"
        role="listbox"
        tabindex="-1"
        aria-label="Printings"
        (keydown)="onListKey($event)"
      >
        <button
          type="button"
          role="option"
          class="pp__row"
          [attr.aria-selected]="!data.selection.printingId && !data.selection.rarity"
          (click)="pick({ printingId: null, rarity: null })"
        >
          <span class="pp__row-text">Any printing</span>
          @if (!data.selection.printingId && !data.selection.rarity) {
            <app-shell-icon class="pp__check" name="check" [size]="18" />
          }
        </button>
        @for (printing of shown(); track printing.id) {
          <button
            type="button"
            role="option"
            class="pp__row"
            [attr.aria-selected]="data.selection.printingId === printing.id"
            (click)="pick({ printingId: printing.id ?? null, rarity: null })"
          >
            <span class="pp__row-text">
              <span class="pp__code">{{ code(printing) }}</span>
              {{ rest(printing) }}
            </span>
            @if (data.selection.printingId === printing.id) {
              <app-shell-icon class="pp__check" name="check" [size]="18" />
            }
          </button>
        } @empty {
          <p class="pp__empty">No printing matches. Try another code or set name.</p>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .pp {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      max-height: min(520px, calc(100dvh - 160px));
      padding: 16px;
    }
    .pp__title {
      margin: 0;
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-semibold);
    }
    .pp__field {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      height: 40px;
      padding: 0 12px;
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-input);
      background: var(--color-surface);
    }
    .pp__field:focus-within {
      border-color: var(--color-accent);
    }
    .pp__input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--color-ink);
      font: inherit;
    }
    .pp__muted {
      color: var(--color-text-muted);
    }
    .pp__chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .pp__chip {
      min-height: 32px;
      padding: 0 12px;
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-ink);
      font: inherit;
      font-size: var(--font-size-meta);
      cursor: pointer;
    }
    .pp__chip[aria-pressed='true'] {
      border-color: var(--color-accent);
      background: var(--color-accent-tint);
      font-weight: var(--font-weight-semibold);
    }
    .pp__list {
      display: flex;
      flex-direction: column;
      min-height: 0;
      margin: 0 -8px;
      overflow-y: auto;
    }
    .pp__row {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      min-height: 44px;
      padding: 6px 8px;
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--color-ink);
      font: inherit;
      font-size: var(--font-size-sm);
      text-align: left;
      cursor: pointer;
    }
    .pp__row:hover,
    .pp__row:focus-visible {
      background: var(--color-primary-tint-subtle);
      outline: none;
    }
    .pp__row:focus-visible {
      box-shadow: inset 0 0 0 2px var(--color-accent);
    }
    .pp__row-text {
      flex: 1;
      min-width: 0;
    }
    .pp__code {
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .pp__check {
      color: var(--color-accent);
    }
    .pp__empty {
      margin: 0;
      padding: 8px;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrintingPopoverComponent {
  protected readonly ref = inject(PopoverRef);
  protected readonly data = inject(PRINTING_POPOVER_DATA);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly text = signal('');
  protected readonly rarity = signal<string | null>(null);
  protected readonly rarities = computed(() => [
    ...new Set(this.data.printings.map((printing) => printing.rarity).filter(Boolean) as string[]),
  ]);
  protected readonly shown = computed(() =>
    filterPrintings(this.data.printings, this.text(), this.rarity()),
  );

  constructor() {
    afterNextRender(() =>
      this.host.nativeElement.querySelector<HTMLInputElement>('input')?.focus(),
    );
  }

  protected code(printing: PrintingSummary): string {
    return printingCode(printing);
  }

  protected rest(printing: PrintingSummary): string {
    const label = printingRowLabel(printing);
    const code = printingCode(printing);
    return code && label.startsWith(code) ? label.slice(code.length) : ` ${label}`;
  }

  protected toggleRarity(value: string): void {
    this.rarity.set(this.rarity() === value ? null : value);
  }

  protected pick(selection: PrintingSelection): void {
    this.data.pick(selection);
    this.ref.close();
  }

  protected onFieldKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.options()[0]?.focus();
    }
  }

  protected onListKey(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const options = this.options();
    const index = options.indexOf(event.target as HTMLElement);
    if (event.key === 'ArrowUp' && index <= 0) {
      this.host.nativeElement.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : Math.min(Math.max(index + (event.key === 'ArrowDown' ? 1 : -1), 0), options.length - 1);
    options[next]?.focus();
  }

  private options(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[role="option"]'));
  }
}
