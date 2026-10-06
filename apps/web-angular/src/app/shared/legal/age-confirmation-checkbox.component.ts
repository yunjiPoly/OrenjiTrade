import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';

/** The API's document type of the 18+ attestation (`POST /me/consents`). */
export const AGE_CONFIRMATION_TYPE = 'AGE_CONFIRMATION';

/**
 * Checkbox and validation wording, English and its French equivalent (Bill 96). Both languages
 * are always shown; the rest of the UI is English-only until the full translation.
 */
export const AGE_CONFIRMATION_LABEL_EN = 'I confirm I am 18 years of age or older';
export const AGE_CONFIRMATION_LABEL_FR = 'Je confirme avoir 18 ans ou plus';
export const AGE_CONFIRMATION_ERROR =
  'You must confirm that you are 18 years of age or older to use OrenjiTrade.';
export const AGE_CONFIRMATION_ERROR_FR =
  'Vous devez confirmer avoir 18 ans ou plus pour utiliser OrenjiTrade.';

/**
 * The 18+ confirmation checkbox: never ticked by default, the parent owns the `requiredTrue`
 * control and records the confirmation server-side with `POST /me/consents`
 * (`AGE_CONFIRMATION`). Self-declaration only: nothing else is asked or verified.
 */
@Component({
  selector: 'app-age-confirmation-checkbox',
  imports: [ReactiveFormsModule, MatCheckboxModule],
  template: `
    <div class="age" [attr.aria-describedby]="showError() ? 'age-confirmation-error' : null">
      <mat-checkbox class="age__box" [formControl]="control()" data-testid="age-confirmation">
        <span class="age__label">{{ labelEn }}</span>
        <span class="age__label age__label--fr" lang="fr">{{ labelFr }}</span>
      </mat-checkbox>
      @if (showError()) {
        <p class="age__error" id="age-confirmation-error" role="alert">
          <span class="age__error-line">{{ errorMessage }}</span>
          <span class="age__error-line" lang="fr">{{ errorMessageFr }}</span>
        </p>
      }
    </div>
  `,
  styles: `
    .age {
      padding: var(--spacing-3) var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .age__label {
      display: block;
    }
    .age__label--fr {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .age__error {
      margin: var(--spacing-1) 0 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    .age__error-line {
      display: block;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgeConfirmationCheckboxComponent {
  readonly control = input.required<FormControl<boolean>>();
  /** Show the validation message (the parent sets it after a submit attempt). */
  readonly showError = input(false);

  protected readonly labelEn = AGE_CONFIRMATION_LABEL_EN;
  protected readonly labelFr = AGE_CONFIRMATION_LABEL_FR;
  protected readonly errorMessage = AGE_CONFIRMATION_ERROR;
  protected readonly errorMessageFr = AGE_CONFIRMATION_ERROR_FR;
}
