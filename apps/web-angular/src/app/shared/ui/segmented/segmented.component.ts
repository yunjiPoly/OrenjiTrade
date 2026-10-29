import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  booleanAttribute,
  inject,
  input,
  output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  icon?: string;
  /** What a screen reader says when the label is a symbol ("$" -> "Dollars"). */
  spoken?: string;
}

/**
 * A segmented control (spec 2.4: [All | Public | Private], [$ | % TCG], [Table | Grid]): a
 * radio group of buttons, the chosen one filled with ink. Arrow keys move and choose; Tab enters
 * on the chosen option.
 */
@Component({
  selector: 'app-segmented',
  imports: [MatIconModule],
  template: `
    @for (option of options(); track option.value) {
      <button
        type="button"
        role="radio"
        class="seg__opt"
        [class.seg__opt--on]="option.value === value()"
        [attr.aria-checked]="option.value === value()"
        [attr.aria-label]="option.spoken ?? null"
        [attr.data-value]="option.value"
        [tabindex]="option.value === value() || (!hasValue() && $first) ? 0 : -1"
        [disabled]="disabled()"
        (click)="choose(option.value)"
        (keydown)="onKey($event, $index)"
      >
        @if (option.icon) {
          <mat-icon aria-hidden="true">{{ option.icon }}</mat-icon>
        }
        <span>{{ option.label }}</span>
      </button>
    }
  `,
  host: {
    role: 'radiogroup',
    class: 'seg',
    '[class.seg--sm]': "size() === 'sm'",
    '[class.seg--lg]': "size() === 'lg'",
    '[class.seg--block]': 'block()',
    '[attr.aria-label]': 'label()',
  },
  styles: `
    :host {
      display: inline-flex;
      gap: 2px;
      padding: 3px;
      border: 1px solid var(--color-border);
      border-radius: 10px;
      background: var(--color-surface-variant);
    }
    :host(.seg--block) {
      display: flex;
    }
    :host(.seg--block) .seg__opt {
      flex: 1 1 0;
      justify-content: center;
    }
    .seg__opt {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 32px;
      padding: 0 12px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      white-space: nowrap;
      cursor: pointer;
    }
    :host(.seg--sm) .seg__opt {
      min-height: 26px;
      padding: 0 8px;
      font-size: var(--font-size-meta);
    }
    :host(.seg--lg) .seg__opt {
      min-height: 38px;
      font-size: var(--font-size-body);
    }
    .seg__opt:hover:not(.seg__opt--on):not(:disabled) {
      background: var(--color-surface-elevated);
      color: var(--color-ink);
    }
    .seg__opt--on {
      background: var(--color-ink);
      color: var(--color-background);
    }
    .seg__opt:disabled {
      cursor: default;
      opacity: 0.55;
    }
    .seg__opt:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 1px;
    }
    .seg__opt mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    @media (forced-colors: active) {
      .seg__opt--on {
        outline: 2px solid Highlight;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SegmentedComponent<T extends string = string> {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly options = input.required<readonly SegmentOption<T>[]>();
  readonly value = input<T | null>(null);
  readonly label = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly block = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly valueChange = output<T>();

  protected hasValue(): boolean {
    return this.options().some((option) => option.value === this.value());
  }

  protected choose(value: T): void {
    if (value !== this.value()) {
      this.valueChange.emit(value);
    }
  }

  protected onKey(event: KeyboardEvent, index: number): void {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      // Alt+↑ / Alt+↓ belong to the drawer (Previous, Next).
      return;
    }
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) {
      return;
    }
    event.preventDefault();
    const options = this.options();
    const next = (index + step + options.length) % options.length;
    this.choose(options[next].value);
    const buttons = this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.seg__opt');
    buttons[next]?.focus();
  }
}
