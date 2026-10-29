import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { InventoryItemResponse } from '@orenji/api-client';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../../shared/ui/segmented/segmented.component';
import {
  PRICE_COPY,
  PriceFieldValue,
  PriceMode,
  checkPrice,
  priceInputOf,
  readAskingPrice,
  rememberPriceMode,
} from '../data/item-price';

const MODES: readonly SegmentOption<PriceMode>[] = [
  { value: 'usd', label: '$', spoken: PRICE_COPY.modes.usd.spoken },
  { value: 'pct', label: '% TCG', spoken: PRICE_COPY.modes.pct.spoken },
];

/**
 * The table's inline price (spec 9.4): [$ | % TCG] and a number; Enter saves, Esc cancels. A saved
 * text neither mode can show reads "Was: {text}". Emits the text to save (null clears the price).
 */
@Component({
  selector: 'app-price-editor',
  imports: [MatIconModule, SegmentedComponent],
  template: `
    <div
      class="pe"
      role="group"
      [attr.aria-label]="'Asking price of ' + item().card.name"
      (keydown.escape)="onEscape($event)"
      (click)="$event.stopPropagation()"
    >
      <div class="pe__row">
        <app-segmented
          label="Price in"
          size="sm"
          [options]="modes"
          [value]="mode()"
          (valueChange)="switchMode($event)"
        />
        <input
          #field
          class="pe__input"
          inputmode="decimal"
          autocomplete="off"
          [attr.aria-label]="inputLabel()"
          [attr.aria-invalid]="!!error()"
          [attr.aria-describedby]="'pe-hint-' + item().id"
          [placeholder]="mode() === 'pct' ? '% TCG' : '$'"
          [value]="number()"
          (input)="onInput(field.value)"
          (keydown.enter)="onEnter($event)"
        />
        <button
          type="button"
          class="pe__btn pe__btn--ok"
          aria-label="Save the price"
          (click)="submit()"
        >
          <mat-icon aria-hidden="true">check</mat-icon>
        </button>
        <button type="button" class="pe__btn" aria-label="Cancel" (click)="dismiss.emit()">
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </div>
      <p class="pe__hint" [id]="'pe-hint-' + item().id" [class.pe__hint--error]="!!error()">
        @if (error(); as message) {
          <span role="alert">{{ message }}</span>
        } @else {
          @if (was(); as text) {
            {{ wasLabel(text) }} ·
          }
          Enter saves · Esc cancels
        }
      </p>
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      top: 50%;
      right: 0;
      z-index: 5;
      transform: translateY(-50%);
    }
    .pe {
      display: grid;
      gap: 6px;
      padding: 12px;
      border: 1px solid var(--color-border-strong);
      border-radius: 14px;
      background: var(--color-surface-elevated);
      box-shadow: var(--elevation-menu);
      text-align: left;
    }
    .pe__row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pe__input {
      width: 100px;
      height: 36px;
      padding: 0 10px;
      border: 1px solid var(--color-border-input);
      border-radius: 10px;
      background: var(--color-surface);
      color: var(--color-ink);
      font: inherit;
      font-size: var(--font-size-sm);
    }
    .pe__input:focus {
      border-color: var(--color-accent);
      outline: none;
    }
    .pe__btn {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border: 1px solid var(--color-border);
      border-radius: 50%;
      background: transparent;
      color: var(--color-ink);
      cursor: pointer;
    }
    .pe__btn--ok {
      border-color: var(--color-ink);
      background: var(--color-ink);
      color: var(--color-background);
    }
    .pe__btn:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    .pe__btn mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .pe__hint {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
      white-space: nowrap;
    }
    .pe__hint--error {
      color: var(--color-danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceEditorComponent implements AfterViewInit {
  readonly item = input.required<InventoryItemResponse>();
  readonly save = output<string | null>();
  readonly dismiss = output<void>();

  protected readonly modes = MODES;
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly start = computed(() => readAskingPrice(this.item()));
  protected readonly mode = signal<PriceMode>('usd');
  protected readonly number = signal('');
  protected readonly was = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly inputLabel = computed(() => PRICE_COPY.inputLabel[this.mode()]);

  ngAfterViewInit(): void {
    const start = this.start();
    this.mode.set(start.mode ?? 'usd');
    this.number.set(start.number);
    this.was.set(start.was);
    const input = this.field().nativeElement;
    input.value = start.number;
    input.focus();
    input.select();
  }

  protected wasLabel(text: string): string {
    return PRICE_COPY.was(text);
  }

  protected switchMode(mode: PriceMode): void {
    this.mode.set(mode);
    this.number.set('');
    this.field().nativeElement.value = '';
    this.error.set(null);
    this.field().nativeElement.focus();
  }

  protected onInput(text: string): void {
    const kept = priceInputOf(this.mode(), text);
    if (kept !== text) {
      this.field().nativeElement.value = kept;
    }
    this.number.set(kept);
    this.was.set(null);
    this.error.set(null);
  }

  protected onEnter(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.submit();
  }

  protected onEscape(event: Event): void {
    event.stopPropagation();
    this.dismiss.emit();
  }

  protected submit(): void {
    const start = this.start();
    if (this.was() !== null && !this.number().trim()) {
      // Nothing typed over an old text: it stays as it is.
      this.dismiss.emit();
      return;
    }
    const check = checkPrice(this.mode(), this.number());
    if (check.kind === 'error') {
      this.error.set(check.message);
      this.field().nativeElement.focus();
      return;
    }
    rememberPriceMode(this.mode());
    const text = check.kind === 'ok' ? check.text : null;
    if (text === savedPriceText(start)) {
      // The price as saved, read back ("12.5 $" reads as $12.50): no change (F6), as Edit card.
      this.dismiss.emit();
      return;
    }
    this.save.emit(text);
  }
}

/** The text the saved price reads back as in its mode; a "Was" text as it is; null for none. */
export function savedPriceText(start: PriceFieldValue): string | null {
  if (start.was !== null) {
    return start.was;
  }
  if (start.mode === null) {
    return null;
  }
  const check = checkPrice(start.mode, start.number);
  return check.kind === 'ok' ? check.text : null;
}
