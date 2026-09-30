import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { SCORE_WORDS } from './rating-labels';

const SCORES = [1, 2, 3, 4, 5] as const;

/**
 * Accessible 1–5 star picker for reactive forms: a radio group of five star buttons with a roving
 * tab stop (arrow keys move and select, Home/End jump), a hover preview and, for optional
 * criteria, a "Clear" button that sets the value back to `null`.
 */
@Component({
  selector: 'app-star-rating-input',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => StarRatingInputComponent),
      multi: true,
    },
  ],
  template: `
    <div
      class="picker"
      role="radiogroup"
      [attr.aria-label]="label()"
      [attr.aria-required]="required() || null"
      [attr.aria-disabled]="disabled() || null"
      (mouseleave)="hover.set(null)"
    >
      @for (score of scores; track score) {
        <button
          type="button"
          role="radio"
          class="picker__star"
          [class.picker__star--on]="score <= shown()"
          [attr.aria-checked]="value() === score"
          [attr.aria-label]="score + (score === 1 ? ' star, ' : ' stars, ') + words[score]"
          [attr.tabindex]="tabStop() === score ? 0 : -1"
          [disabled]="disabled()"
          (click)="select(score)"
          (keydown)="onKey($event, score)"
          (mouseenter)="hover.set(score)"
          (blur)="touched()"
        >
          <span aria-hidden="true">★</span>
        </button>
      }
      <span class="picker__word" aria-hidden="true">{{ word() }}</span>
      @if (clearable() && value() !== null && !disabled()) {
        <button
          type="button"
          class="picker__clear"
          [attr.aria-label]="'Clear ' + label()"
          (click)="select(null)"
        >
          Clear
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .picker {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .picker__star {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      padding: 0;
      border: 0;
      border-radius: var(--radius-sm);
      background: none;
      color: color-mix(in srgb, var(--color-text-muted) 40%, transparent);
      font-size: 26px;
      line-height: 1;
      cursor: pointer;
      transition:
        color var(--motion-duration-fast) var(--motion-easing-standard),
        transform var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .picker__star:hover:not(:disabled) {
      transform: scale(1.12);
    }
    .picker__star--on {
      color: var(--color-warning);
    }
    .picker__star:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 1px;
    }
    .picker__star:disabled {
      cursor: default;
      opacity: 0.5;
    }
    .picker__word {
      min-width: 72px;
      margin-left: var(--spacing-2);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .picker__clear {
      padding: 2px var(--spacing-2);
      border: 0;
      border-radius: var(--radius-pill);
      background: none;
      color: var(--color-accent);
      font: inherit;
      font-size: var(--font-size-xs);
      cursor: pointer;
    }
    .picker__clear:hover {
      text-decoration: underline;
    }
    @media (prefers-reduced-motion: reduce) {
      .picker__star {
        transition: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StarRatingInputComponent implements ControlValueAccessor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Accessible name of the group ("Overall", "Communication"). */
  readonly label = input.required<string>();
  readonly required = input(false, { transform: booleanAttribute });
  /** Offer "Clear" (optional criteria). */
  readonly clearable = input(false, { transform: booleanAttribute });

  protected readonly scores = SCORES;
  protected readonly words = SCORE_WORDS;
  protected readonly value = signal<number | null>(null);
  protected readonly hover = signal<number | null>(null);
  protected readonly disabled = signal(false);
  protected readonly shown = computed(() => this.hover() ?? this.value() ?? 0);
  protected readonly word = computed(() => SCORE_WORDS[this.shown()] ?? '');
  /** The star that takes the Tab stop: the selected one, else the first. */
  protected readonly tabStop = computed(() => this.value() ?? 1);

  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: unknown): void {
    this.value.set(typeof value === 'number' && value >= 1 && value <= 5 ? value : null);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected select(score: number | null): void {
    if (this.disabled()) {
      return;
    }
    this.value.set(score);
    this.onChange(score);
    this.onTouched();
    if (score === null) {
      this.focusStar(1);
    }
  }

  protected touched(): void {
    this.onTouched();
  }

  protected onKey(event: KeyboardEvent, score: number): void {
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = Math.min(5, score + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = Math.max(1, score - 1);
        break;
      case 'Home':
        next = 1;
        break;
      case 'End':
        next = 5;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.select(next);
    this.focusStar(next);
  }

  private focusStar(score: number): void {
    this.host.nativeElement
      .querySelectorAll<HTMLButtonElement>('.picker__star')
      .item(score - 1)
      ?.focus();
  }
}
