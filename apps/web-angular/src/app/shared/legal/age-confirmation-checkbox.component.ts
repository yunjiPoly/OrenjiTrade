import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

/** The API's document type of the 18+ attestation (`POST /me/consents`). */
export const AGE_CONFIRMATION_TYPE = 'AGE_CONFIRMATION';

/**
 * The checkbox's words. English only (owner, 2026-10-20: the spec's
 * "in English and French" line is written in English only, as on the phone since R12).
 */
export const AGE_CONFIRMATION_LABEL_EN = 'I confirm I am 18 years of age or older';

/**
 * The 18+ confirmation (spec 14, board W27): its own card under the documents, never ticked by
 * default and never by "Accept all"; ringed in amber after a refused submit (`warn`). The parent
 * owns the `requiredTrue` control and records the confirmation server-side with
 * `POST /me/consents` (`AGE_CONFIRMATION`). Self-declaration only: nothing else is asked or
 * verified.
 */
@Component({
  selector: 'app-age-confirmation-checkbox',
  imports: [ReactiveFormsModule],
  template: `
    <label class="age" [class.age--warn]="warn()" data-testid="age-confirmation">
      <input type="checkbox" class="box" [formControl]="control()" />
      <span>{{ label }}</span>
    </label>
  `,
  styleUrl: './consent-boxes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgeConfirmationCheckboxComponent {
  readonly control = input.required<FormControl<boolean>>();
  /** Ring the box while it is unticked (the parent sets it after a refused submit). */
  readonly warn = input(false);

  protected readonly label = AGE_CONFIRMATION_LABEL_EN;
}
