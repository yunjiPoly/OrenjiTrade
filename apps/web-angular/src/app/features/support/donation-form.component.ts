import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { DonationCheckoutRequest } from '@orenji/api-client';
import {
  DONATION_CURRENCIES,
  DONATION_MESSAGE_MAX,
  DONATION_PRESETS,
  amountLabel,
} from '../../shared/billing/billing-labels';
import { DonationFormValue, amountValidator, donationRequest, parseAmount } from './donation-form';

/** Server-side refusals of the last attempt, keyed by field (from `donationProblem`). */
export interface DonationFieldErrors {
  amount: string | null;
  currency: string | null;
}

/**
 * The voluntary donation form: a preset or custom amount, the currency, an optional private
 * message and the public-thanks opt-in. Emits the checkout request; the page opens the checkout
 * and passes back the API's field refusals (accepted range and currencies live in the API).
 */
@Component({
  selector: 'app-donation-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <form class="donate" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <fieldset class="donate__amounts">
        <legend class="donate__legend">Amount</legend>
        <mat-button-toggle-group
          formControlName="preset"
          aria-label="Donation amount"
          class="donate__presets"
          hideSingleSelectionIndicator
        >
          @for (preset of presets; track preset) {
            <mat-button-toggle [value]="'' + preset">{{ presetLabel(preset) }}</mat-button-toggle>
          }
          <mat-button-toggle value="other">Other</mat-button-toggle>
        </mat-button-toggle-group>
      </fieldset>

      <div class="donate__row">
        @if (preset() === 'other') {
          <mat-form-field appearance="outline" class="donate__custom">
            <mat-label>Your amount</mat-label>
            <input
              matInput
              formControlName="custom"
              inputmode="decimal"
              autocomplete="off"
              data-testid="donation-custom-amount"
            />
            @if (form.controls.custom.hasError('required')) {
              <mat-error>Enter an amount.</mat-error>
            } @else if (form.controls.custom.hasError('amount')) {
              <mat-error>Enter a positive amount with at most two decimals.</mat-error>
            } @else if (form.controls.custom.hasError('server')) {
              <mat-error>{{ serverErrors()?.amount }}</mat-error>
            }
          </mat-form-field>
        }
        <mat-form-field appearance="outline" class="donate__currency">
          <mat-label>Currency</mat-label>
          <mat-select formControlName="currency">
            @for (currency of currencies; track currency) {
              <mat-option [value]="currency">{{ currency }}</mat-option>
            }
          </mat-select>
          @if (form.controls.currency.hasError('server')) {
            <mat-error>{{ serverErrors()?.currency }}</mat-error>
          }
        </mat-form-field>
      </div>
      @if (preset() !== 'other' && serverErrors()?.amount; as amountError) {
        <p class="donate__error" role="alert">{{ amountError }}</p>
      }

      <mat-form-field appearance="outline" class="donate__message">
        <mat-label>Message (optional)</mat-label>
        <textarea
          matInput
          formControlName="message"
          rows="3"
          [attr.maxlength]="messageMax"
        ></textarea>
        <mat-hint>Only the OrenjiTrade team reads it; it is never published.</mat-hint>
        <mat-hint align="end">{{ messageLength() }} / {{ messageMax }}</mat-hint>
        @if (form.controls.message.hasError('maxlength')) {
          <mat-error>Keep it under {{ messageMax }} characters.</mat-error>
        }
      </mat-form-field>

      <mat-checkbox formControlName="publicThanks" class="donate__thanks">
        Thank me publicly: show my display name on the supporters list (never the amount or the
        message).
      </mat-checkbox>

      <button matButton="filled" type="submit" class="donate__submit" [disabled]="busy()">
        <mat-icon aria-hidden="true">volunteer_activism</mat-icon>
        {{ busy() ? 'Opening the checkout…' : submitLabel() }}
      </button>
    </form>
  `,
  styles: `
    :host {
      display: block;
    }
    .donate {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
    }
    .donate__amounts {
      margin: 0;
      padding: 0;
      border: 0;
    }
    .donate__legend {
      margin-bottom: var(--spacing-2);
      font-weight: var(--font-weight-medium);
    }
    .donate__presets {
      flex-wrap: wrap;
    }
    .donate__row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-3);
    }
    .donate__custom {
      flex: 1 1 180px;
    }
    .donate__currency {
      flex: 0 1 140px;
    }
    .donate__message {
      width: 100%;
    }
    .donate__error {
      margin: 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    .donate__submit {
      align-self: flex-start;
    }
    @media (max-width: 599px) {
      .donate__submit {
        align-self: stretch;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly busy = input(false);
  readonly serverErrors = input<DonationFieldErrors | null>(null);

  readonly donate = output<DonationCheckoutRequest>();

  protected readonly presets = DONATION_PRESETS;
  protected readonly currencies = DONATION_CURRENCIES;
  protected readonly messageMax = DONATION_MESSAGE_MAX;
  protected readonly form = this.fb.group({
    preset: this.fb.control('10'),
    custom: this.fb.control('', [Validators.required, amountValidator]),
    currency: this.fb.control(DONATION_CURRENCIES[0], [Validators.required]),
    message: this.fb.control('', [Validators.maxLength(DONATION_MESSAGE_MAX)]),
    publicThanks: this.fb.control(false),
  });
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly preset = computed(() => this.value().preset);
  protected readonly messageLength = computed(() => (this.value().message ?? '').length);
  protected readonly currency = computed(() => this.value().currency ?? DONATION_CURRENCIES[0]);
  protected readonly submitLabel = computed(() => {
    const value = this.value();
    const amount = parseAmount(value.preset === 'other' ? value.custom : value.preset);
    return amount ? `Donate ${amountLabel(amount, this.currency())}` : 'Donate';
  });

  constructor() {
    this.syncCustom('10');
    this.form.controls.preset.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((preset) => this.syncCustom(preset));
    effect(() => {
      const errors = this.serverErrors();
      const custom = this.form.controls.custom;
      const currency = this.form.controls.currency;
      if (errors?.amount && this.form.controls.preset.value === 'other') {
        custom.setErrors({ ...(custom.errors ?? {}), server: true });
        custom.markAsTouched();
      }
      if (errors?.currency) {
        currency.setErrors({ ...(currency.errors ?? {}), server: true });
        currency.markAsTouched();
      }
    });
  }

  /** "$10" for a preset in the chosen currency. */
  protected presetLabel(amount: number): string {
    return amountLabel(amount, this.currency()).replace(/[.,]00(?=\D*$)/, '');
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    const value: DonationFormValue = this.form.getRawValue();
    const request = donationRequest(value);
    if (!request || this.form.controls.message.invalid) {
      return;
    }
    this.donate.emit(request);
  }

  /** The custom amount only counts (and validates) when "Other" is chosen. */
  private syncCustom(preset: string): void {
    const custom = this.form.controls.custom;
    if (preset === 'other') {
      custom.enable({ emitEvent: false });
    } else {
      custom.disable({ emitEvent: false });
    }
  }
}
