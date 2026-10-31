import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import {
  ResolveReportRequest,
  ResolveReportRequestActionEnum,
  ResolveReportRequestStatusEnum,
} from '@orenji/api-client';
import { ResolutionAction } from '../../../shared/reports/report-labels';
import { endOfDayIso, tomorrowIso } from '../users/suspend-dialog.component';
import { AdminIconComponent } from '../console/admin-icon.component';

export interface ResolveReportDialogData {
  reportedName: string;
  reportedHandle: string;
  /** ADMIN or SUPER_ADMIN: suspensions and bans are allowed. */
  canSuspend: boolean;
  /** The report's short number ("#1047"), and its reason and context ("Scam or fraud · from a
   * conversation"). */
  number?: string;
  subtitle?: string;
  /** The other open reports about the collector ("#1045", "#1044"): they stay open. */
  otherOpen?: readonly string[];
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
 * The error of "Suspended until" (review fix 1): a typed date must come after today (the `min`
 * attribute does not stop typing, and the API refuses a past date after the dialog closed).
 * `null` when empty (an indefinite suspension) or valid.
 */
export function suspendUntilError(value: string, minDate: string): string | null {
  if (!value) {
    return null;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= minDate
    ? null
    : 'Choose a date after today.';
}

/** The confirm button names the action (spec 15.4, board A3). */
export function resolveConfirmLabel(
  decision: ResolveDecision | null,
  action: ResolutionAction | null,
): string {
  if (decision === 'DISMISSED') {
    return 'Dismiss the report';
  }
  switch (action) {
    case 'WARNING':
      return 'Warn and resolve';
    case 'LISTINGS_PAUSED':
      return 'Pause listings and resolve';
    case 'SUSPENDED':
      return 'Suspend and resolve';
    case 'BANNED':
      return 'Ban and resolve';
    default:
      return 'Resolve report';
  }
}

/**
 * Resolve a collector report: take action (warning, pause listings, and for administrators
 * suspend or ban) or dismiss, with a required note for the audit log and whether to tell the
 * reporter (a REPORT_DECISION notification without specifics).
 */
@Component({
  selector: 'app-resolve-report-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, AdminIconComponent],
  template: `
    <form class="rd" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="rd__head">
        <h2 class="rd__title" mat-dialog-title id="resolve-title">
          Resolve report {{ data.number ? data.number + ' ' : '' }}about &#64;{{
            data.reportedHandle
          }}
        </h2>
        @if (data.subtitle) {
          <p class="rd__sub">{{ data.subtitle }}</p>
        }
        <button type="button" class="rd__close" mat-dialog-close aria-label="Close">
          <app-admin-icon name="close" [size]="20" />
        </button>
      </div>
      <mat-dialog-content class="rd__body">
        <fieldset class="rd__set">
          <legend class="rd__lead">Decision</legend>
          <div class="rd__cards rd__cards--two">
            <label class="rc" [class.rc--on]="decision() === 'ACTIONED'">
              <input type="radio" name="decision" formControlName="decision" value="ACTIONED" />
              <span class="rc__label">Take action</span>
            </label>
            <label class="rc" [class.rc--on]="decision() === 'DISMISSED'">
              <input type="radio" name="decision" formControlName="decision" value="DISMISSED" />
              <span class="rc__label">Dismiss: no violation found</span>
            </label>
          </div>
        </fieldset>

        @if (decision() === 'ACTIONED') {
          <fieldset
            class="rd__set"
            [attr.aria-invalid]="showActionError() ? 'true' : null"
            [attr.aria-describedby]="showActionError() ? 'resolve-action-error' : null"
          >
            <legend class="rd__lead">Action</legend>
            <div class="rd__cards rd__cards--two">
              @for (choice of choices; track choice.value) {
                @let locked = choice.adminOnly && !data.canSuspend;
                <label
                  class="rc rc--tall"
                  [class.rc--on]="action() === choice.value"
                  [class.rc--locked]="locked"
                >
                  <input
                    type="radio"
                    name="action"
                    formControlName="action"
                    [value]="choice.value"
                    [attr.disabled]="locked ? '' : null"
                    [attr.aria-labelledby]="'resolve-label-' + choice.value"
                    [attr.aria-describedby]="
                      (choice.adminOnly ? 'resolve-tag-' + choice.value + ' ' : '') +
                      'resolve-' +
                      choice.value
                    "
                  />
                  <span class="rc__text">
                    <span class="rc__label">
                      <span [id]="'resolve-label-' + choice.value">{{ choice.label }}</span>
                      @if (choice.adminOnly) {
                        <span class="rc__tag" [id]="'resolve-tag-' + choice.value">Admins</span>
                      }
                    </span>
                    <span class="rc__desc" [id]="'resolve-' + choice.value">
                      {{ choice.description }}
                      @if (locked) {
                        <strong>Administrators only.</strong>
                      }
                    </span>
                  </span>
                </label>
              }
            </div>
            @if (showActionError()) {
              <p class="rd__error" id="resolve-action-error" role="alert">
                Choose the action to take.
              </p>
            }
          </fieldset>
          @if (action() === 'SUSPENDED') {
            <div class="rd__field">
              <label class="rd__lead" for="resolve-until">Suspended until (optional)</label>
              <input
                id="resolve-until"
                class="cp-input rd__date"
                type="date"
                formControlName="suspendUntil"
                [min]="minDate"
                [attr.aria-invalid]="untilError() ? 'true' : null"
                [attr.aria-describedby]="
                  untilError() ? 'resolve-until-error resolve-until-hint' : 'resolve-until-hint'
                "
              />
              <p class="rd__hint" id="resolve-until-hint">
                Leave empty for an indefinite suspension.
              </p>
              @if (untilError(); as message) {
                <p class="rd__error" id="resolve-until-error" role="alert">{{ message }}</p>
              }
            </div>
          }
        }

        <div class="rd__field">
          <div class="rd__row">
            <label class="rd__lead" for="resolve-note"
              >Resolution note <span class="rd__req">· required</span></label
            >
            <span class="rd__count" aria-hidden="true">{{ noteLength() }} / {{ noteMax }}</span>
          </div>
          <textarea
            id="resolve-note"
            class="cp-input"
            formControlName="note"
            rows="3"
            [attr.maxlength]="noteMax"
            required
            [attr.aria-invalid]="noteError() ? 'true' : null"
            [attr.aria-describedby]="
              noteError() ? 'resolve-note-error resolve-note-hint' : 'resolve-note-hint'
            "
          ></textarea>
          <p class="rd__hint" id="resolve-note-hint">Staff only. The reporter never sees it.</p>
          @if (noteError()) {
            <p class="rd__error" id="resolve-note-error" role="alert">A note is required.</p>
          }
        </div>

        <label class="rd__check">
          <input type="checkbox" formControlName="notifyReporter" />
          <span>Tell the reporter the report was reviewed</span>
        </label>

        @if (data.otherOpen?.length) {
          <p class="rd__info">
            <app-admin-icon name="info" [size]="16" />
            <span
              >The other open reports about &#64;{{ data.reportedHandle }} ({{
                data.otherOpen!.join(', ')
              }}) stay open: resolve each one.</span
            >
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions class="rd__actions">
        <button type="button" class="cb cb--outline" mat-dialog-close>Cancel</button>
        <button
          type="submit"
          class="cb"
          [class.cb--primary]="!severe()"
          [class.cb--danger]="severe()"
          data-testid="resolve-confirm"
        >
          {{ confirmLabel() }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styleUrls: ['../console/console-page.scss', '../console/console-controls.scss'],
  styles: `
    .rd {
      display: flex;
      flex-direction: column;
      max-height: inherit;
    }
    .rd__head {
      position: relative;
      padding: 24px 56px 12px 24px;
      border-bottom: 1px solid var(--color-border);
    }
    .rd__title {
      margin: 0;
      padding: 0;
      color: var(--color-ink);
      font-family: var(--font-display);
      font-size: 20px;
      font-weight: var(--font-weight-semibold);
      line-height: 28px;
    }
    .rd__title::before {
      display: none;
    }
    .rd__sub {
      margin: 4px 0 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .rd__close {
      position: absolute;
      top: 18px;
      right: 16px;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--color-ink);
      cursor: pointer;
    }
    .rd__close:hover {
      background: var(--color-surface-variant);
    }
    .rd__close:focus-visible,
    .rc:focus-within,
    .rd__check input:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    .rd__body {
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 18px 24px !important;
    }
    .rd__set {
      margin: 0;
      padding: 0;
      border: 0;
    }
    .rd__lead {
      display: block;
      margin: 0 0 8px;
      padding: 0;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .rd__req {
      color: var(--color-text-secondary);
      font-weight: var(--font-weight-regular);
    }
    .rd__cards {
      display: grid;
      gap: 10px;
    }
    .rd__cards--two {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .rc {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid var(--color-border-strong);
      border-radius: 12px;
      background: var(--color-surface);
      cursor: pointer;
    }
    .rc input {
      flex: none;
      width: 18px;
      height: 18px;
      margin: 1px 0 0;
      accent-color: var(--color-primary);
    }
    .rc--on {
      border-color: var(--color-primary);
      background: var(--color-primary-tint);
    }
    .rc--locked {
      cursor: not-allowed;
      opacity: 0.6;
    }
    .rc__text {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .rc__label {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .rc__tag {
      padding: 1px 8px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      color: var(--color-text-secondary);
      font-size: 11px;
    }
    .rc__desc {
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
      line-height: 18px;
    }
    .rd__field {
      display: flex;
      flex-direction: column;
    }
    .rd__row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .rd__count,
    .rd__hint {
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }
    .rd__hint {
      margin: 6px 0 0;
    }
    .rd__date {
      max-width: 220px;
    }
    .rd__error {
      margin: 6px 0 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    .rd__check {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      cursor: pointer;
    }
    .rd__check input {
      width: 18px;
      height: 18px;
      accent-color: var(--color-primary);
    }
    .rd__info {
      display: flex;
      gap: 8px;
      margin: 0;
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--color-surface-variant);
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .rd__actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 14px 24px 20px !important;
      border-top: 1px solid var(--color-border);
    }
    @media (max-width: 599.98px) {
      .rd__cards--two {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResolveReportDialogComponent {
  private readonly ref =
    inject<MatDialogRef<ResolveReportDialogComponent, ResolveReportRequest>>(MatDialogRef);
  protected readonly data = inject<ResolveReportDialogData>(MAT_DIALOG_DATA);
  private readonly document = inject(DOCUMENT);
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
  private readonly noteValue = toSignal(this.form.controls.note.valueChanges, {
    initialValue: this.form.controls.note.value,
  });
  protected readonly noteLength = computed(() => this.noteValue().length);
  protected readonly noteError = computed(
    () => this.attempted() && this.noteValue().trim().length === 0,
  );
  protected readonly confirmLabel = computed(() =>
    resolveConfirmLabel(this.decision(), this.action()),
  );
  private readonly untilValue = toSignal(this.form.controls.suspendUntil.valueChanges, {
    initialValue: this.form.controls.suspendUntil.value,
  });
  /** Shown once a date is typed (or after a try), only for a suspension. */
  protected readonly untilError = computed(() =>
    this.decision() === 'ACTIONED' && this.action() === 'SUSPENDED'
      ? suspendUntilError(this.untilValue(), this.minDate)
      : null,
  );

  protected submit(): void {
    this.attempted.set(true);
    this.form.controls.note.setValue(this.form.controls.note.value.trim());
    this.form.markAllAsTouched();
    const request = resolveRequest(this.form.getRawValue());
    if (this.untilError()) {
      this.document.getElementById('resolve-until')?.focus();
      return;
    }
    if (!request || this.form.invalid) {
      return;
    }
    this.ref.close(request);
  }
}
