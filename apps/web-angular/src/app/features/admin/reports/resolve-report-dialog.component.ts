import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import {
  ResolveReportRequest,
  ResolveReportRequestActionEnum,
  ResolveReportRequestStatusEnum,
} from '@orenji/api-client';
import { ResolutionAction } from '../../../shared/reports/report-labels';
import { endOfDayIso, tomorrowIso } from '../users/suspend-dialog.component';

export interface ResolveReportDialogData {
  reportedName: string;
  reportedHandle: string;
  /** ADMIN or SUPER_ADMIN: suspensions and bans are allowed. */
  canSuspend: boolean;
}

export type ResolveDecision = 'ACTIONED' | 'DISMISSED';

export interface ActionChoice {
  value: ResolutionAction;
  label: string;
  description: string;
  adminOnly: boolean;
}

export const ACTION_CHOICES: readonly ActionChoice[] = [
  {
    value: 'WARNING',
    label: 'Send a warning',
    description: 'The collector gets a notice to review the Community Guidelines.',
    adminOnly: false,
  },
  {
    value: 'LISTINGS_PAUSED',
    label: 'Pause their listings',
    description: 'Public binders and cards are hidden until a moderator resumes them.',
    adminOnly: false,
  },
  {
    value: 'SUSPENDED',
    label: 'Suspend the account',
    description: 'Signed out and hidden until the suspension ends or is lifted.',
    adminOnly: true,
  },
  {
    value: 'BANNED',
    label: 'Ban the account',
    description: 'Suspended without end and marked as banned.',
    adminOnly: true,
  },
];

export const RESOLVE_NOTE_MAX = 1000;

/**
 * Builds the `POST /admin/reports/{id}/resolve` body: DISMISSED always carries NONE, ACTIONED the
 * chosen action; `suspendUntil` only for a suspension with an end date. `null` when incomplete.
 */
export function resolveRequest(value: {
  decision: ResolveDecision | null;
  action: ResolutionAction | null;
  note: string;
  notifyReporter: boolean;
  suspendUntil: string;
}): ResolveReportRequest | null {
  const note = value.note.trim();
  if (!value.decision || !note) {
    return null;
  }
  if (value.decision === 'DISMISSED') {
    return {
      status: ResolveReportRequestStatusEnum.Dismissed,
      action: ResolveReportRequestActionEnum.None,
      note,
      notifyReporter: value.notifyReporter,
    };
  }
  if (!value.action || value.action === 'NONE') {
    return null;
  }
  return {
    status: ResolveReportRequestStatusEnum.Actioned,
    action: value.action as ResolveReportRequestActionEnum,
    note,
    notifyReporter: value.notifyReporter,
    ...(value.action === 'SUSPENDED' && value.suspendUntil
      ? { suspendUntil: endOfDayIso(value.suspendUntil) }
      : {}),
  };
}

/**
 * Resolve a collector report: take action (warning, pause listings, and for administrators
 * suspend or ban) or dismiss, with a required note for the audit log and whether to tell the
 * reporter (a REPORT_DECISION notification without specifics).
 */
@Component({
  selector: 'app-resolve-report-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
  ],
  template: `
    <h2 mat-dialog-title>Resolve report about &#64;{{ data.reportedHandle }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content>
        <p class="lead" id="resolve-decision">Decision</p>
        <mat-radio-group
          class="choices"
          formControlName="decision"
          aria-labelledby="resolve-decision"
        >
          <mat-radio-button value="ACTIONED">Take action</mat-radio-button>
          <mat-radio-button value="DISMISSED">Dismiss — no violation found</mat-radio-button>
        </mat-radio-group>

        @if (decision() === 'ACTIONED') {
          <p class="lead" id="resolve-action">Action</p>
          <mat-radio-group
            class="actions"
            formControlName="action"
            aria-labelledby="resolve-action"
          >
            @for (choice of choices; track choice.value) {
              @let locked = choice.adminOnly && !data.canSuspend;
              <div class="action" [class.action--locked]="locked">
                <mat-radio-button
                  [value]="choice.value"
                  [disabled]="locked"
                  [aria-describedby]="'resolve-' + choice.value"
                >
                  {{ choice.label }}
                </mat-radio-button>
                <p class="action__description" [id]="'resolve-' + choice.value">
                  {{ choice.description }}
                  @if (locked) {
                    <strong>Administrators only.</strong>
                  }
                </p>
              </div>
            }
          </mat-radio-group>
          @if (showActionError()) {
            <p class="error" role="alert">Choose the action to take.</p>
          }
          @if (action() === 'SUSPENDED') {
            <mat-form-field appearance="outline" class="field">
              <mat-label>Suspended until (optional)</mat-label>
              <input matInput type="date" formControlName="suspendUntil" [min]="minDate" />
              <mat-hint>Leave empty for an indefinite suspension.</mat-hint>
            </mat-form-field>
          }
        }

        <mat-form-field appearance="outline" class="field">
          <mat-label>Resolution note</mat-label>
          <textarea
            matInput
            formControlName="note"
            rows="3"
            [attr.maxlength]="noteMax"
            required
          ></textarea>
          <mat-hint>Staff only. The reporter never sees it.</mat-hint>
          @if (form.controls.note.hasError('required')) {
            <mat-error>A note is required.</mat-error>
          }
        </mat-form-field>

        <mat-checkbox formControlName="notifyReporter">
          Tell the reporter the report was reviewed
        </mat-checkbox>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" [class.danger]="severe()">Resolve report</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .lead {
      margin: 0 0 var(--spacing-1);
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .choices {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
      margin-bottom: var(--spacing-3);
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
      margin-bottom: var(--spacing-3);
    }
    .action {
      padding: 0 var(--spacing-2) var(--spacing-1);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
    }
    .action--locked {
      opacity: 0.65;
    }
    .action__description {
      margin: -6px 0 0 44px;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .field {
      display: block;
      width: 100%;
      margin-bottom: var(--spacing-2);
    }
    .error {
      margin: 0 0 var(--spacing-2);
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    .danger {
      --mat-button-filled-container-color: var(--color-danger);
      --mat-button-filled-label-text-color: #fff;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResolveReportDialogComponent {
  private readonly ref =
    inject<MatDialogRef<ResolveReportDialogComponent, ResolveReportRequest>>(MatDialogRef);
  protected readonly data = inject<ResolveReportDialogData>(MAT_DIALOG_DATA);
  protected readonly choices = ACTION_CHOICES;
  protected readonly noteMax = RESOLVE_NOTE_MAX;
  protected readonly minDate = tomorrowIso();

  protected readonly form = new FormGroup({
    decision: new FormControl<ResolveDecision | null>('ACTIONED'),
    action: new FormControl<ResolutionAction | null>(null),
    note: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(RESOLVE_NOTE_MAX)],
    }),
    notifyReporter: new FormControl(true, { nonNullable: true }),
    suspendUntil: new FormControl('', { nonNullable: true }),
  });

  protected readonly decision = toSignal(this.form.controls.decision.valueChanges, {
    initialValue: this.form.controls.decision.value,
  });
  protected readonly action = toSignal(this.form.controls.action.valueChanges, {
    initialValue: this.form.controls.action.value,
  });
  private readonly attempted = signal(false);
  protected readonly showActionError = computed(
    () => this.attempted() && this.decision() === 'ACTIONED' && !this.action(),
  );
  protected readonly severe = computed(
    () =>
      this.decision() === 'ACTIONED' &&
      (this.action() === 'SUSPENDED' || this.action() === 'BANNED'),
  );

  protected submit(): void {
    this.attempted.set(true);
    this.form.controls.note.setValue(this.form.controls.note.value.trim());
    this.form.markAllAsTouched();
    const request = resolveRequest(this.form.getRawValue());
    if (!request || this.form.invalid) {
      return;
    }
    this.ref.close(request);
  }
}
