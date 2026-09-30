import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { RouterLink } from '@angular/router';
import {
  ReportCollectorRequestReasonEnum,
  ReportConfirmation,
  ReportContextRequest,
  ReportContextRequestSourceEnum,
  ReportsService,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { newRequestId, silentErrors } from '../../core/http/http-context';
import { AvatarComponent } from '../ui/avatar/avatar.component';
import { ErrorStateComponent } from '../ui/error-state/error-state.component';
import { SkeletonComponent } from '../ui/skeleton/skeleton.component';
import { ReportProblem, reportProblem } from './report-errors';
import { REPORT_DETAILS_MAX, ReportContextSource } from './report-labels';
import { ReportReasonsService } from './report-reasons.service';

/** The collector being reported. */
export interface ReportTarget {
  id: string;
  displayName: string;
  handle?: string | null;
  avatarUrl?: string | null;
}

/** Where the report was filed from (`context` of `POST /reports/collectors`). */
export interface ReportContextInput {
  source: ReportContextSource;
  conversationId?: string;
  postId?: string;
  binderId?: string;
}

export interface ReportDialogData {
  target: ReportTarget;
  context: ReportContextInput;
}

/**
 * "Report collector" modal (product spec § 23): the collector, "Why are you reporting this
 * user?" with the server's reasons as radio buttons (spec order), optional details, Cancel /
 * Confirm. Confirm stays disabled until a reason is chosen; it sends `POST /reports/collectors`
 * with an `Idempotency-Key` fixed for the dialog (a retry repeats the original answer). Refusals
 * (409 already open, 422 self, 429 daily limit) are explained inline; success turns the dialog
 * into a confirmation. Closes with the {@link ReportConfirmation} once sent.
 */
@Component({
  selector: 'app-report-collector-dialog',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    AvatarComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    @if (sent(); as confirmation) {
      <h2 mat-dialog-title>Report sent</h2>
      <mat-dialog-content>
        <div class="done" role="status">
          <span class="done__icon" aria-hidden="true"><mat-icon>verified_user</mat-icon></span>
          <p class="done__lead">
            Thank you. Our moderation team will review your report about
            <strong>{{ data.target.displayName }}</strong
            >. They are not told who reported them.
          </p>
          <p class="done__muted">
            You will get a notification once the review is complete. Follow it any time in
            <a routerLink="/settings/reports" [mat-dialog-close]="confirmation"
              >Settings → My reports</a
            >.
          </p>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button #done matButton="filled" type="button" [mat-dialog-close]="confirmation">
          Done
        </button>
      </mat-dialog-actions>
    } @else {
      <h2 mat-dialog-title>Report collector</h2>
      <form (submit)="submit($event)" novalidate>
        <mat-dialog-content>
          <div class="who">
            <app-avatar
              [src]="data.target.avatarUrl"
              [name]="data.target.displayName"
              [decorative]="true"
            />
            <span class="who__names">
              <span class="who__name">{{ data.target.displayName }}</span>
              @if (data.target.handle) {
                <span class="who__handle">&#64;{{ data.target.handle }}</span>
              }
            </span>
          </div>

          <p class="question" [id]="ids.question">Why are you reporting this user?</p>

          @if (reasons.reasons(); as options) {
            <mat-radio-group
              class="reasons"
              [formControl]="reason"
              [attr.aria-labelledby]="ids.question"
              required
            >
              @for (option of options; track option.code) {
                <div
                  class="reason"
                  [class.reason--on]="reasonValue() === option.code"
                  [class.reason--off]="blocked()"
                >
                  <mat-radio-button
                    class="reason__radio"
                    [value]="option.code"
                    [aria-describedby]="ids.question + '-' + option.code"
                  >
                    {{ option.label }}
                  </mat-radio-button>
                  <p class="reason__description" [id]="ids.question + '-' + option.code">
                    {{ option.description }}
                  </p>
                </div>
              }
            </mat-radio-group>
          } @else if (reasons.error(); as error) {
            <app-error-state
              compact
              title="The reasons could not load"
              [message]="message(error)"
              (retry)="reasons.load()"
            />
          } @else {
            <div aria-busy="true">
              <span class="visually-hidden">Loading the reasons</span>
              <app-skeleton variant="list" lines="4" />
            </div>
          }

          <mat-form-field appearance="outline" class="details">
            <mat-label>Details (optional)</mat-label>
            <textarea
              matInput
              [formControl]="details"
              rows="3"
              [attr.maxlength]="maxDetails"
              placeholder="What happened? Dates, cards or messages help the moderators."
            ></textarea>
            <mat-hint align="end">{{ detailsLength() }} / {{ maxDetails }}</mat-hint>
            @if (details.hasError('maxlength')) {
              <mat-error>Keep the details under {{ maxDetails }} characters.</mat-error>
            }
          </mat-form-field>

          <p class="privacy">
            <mat-icon aria-hidden="true">lock</mat-icon>
            Reports are confidential and reviewed by the OrenjiTrade moderation team. False reports
            can lead to action on your own account.
          </p>

          @if (problem(); as problem) {
            <p class="problem" role="alert" data-testid="report-error">
              <mat-icon aria-hidden="true">{{ problem.alreadyOpen ? 'info' : 'error' }}</mat-icon>
              <span>{{ problem.message }}</span>
            </p>
          }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button matButton type="button" mat-dialog-close>Cancel</button>
          <button matButton="filled" type="submit" [disabled]="!canConfirm()">
            {{ submitting() ? 'Sending…' : 'Confirm' }}
          </button>
        </mat-dialog-actions>
      </form>
    }
  `,
  styles: `
    .who {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      margin-bottom: var(--spacing-4);
      padding: var(--spacing-3);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
    }
    .who__names {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .who__name {
      font-weight: var(--font-weight-semibold);
      color: var(--color-ink);
    }
    .who__handle {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .question {
      margin: 0 0 var(--spacing-2);
      color: var(--color-ink);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
    }
    .reasons {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
      margin-bottom: var(--spacing-4);
    }
    .reason {
      padding: 2px var(--spacing-2) var(--spacing-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      transition:
        border-color var(--motion-duration-fast) var(--motion-easing-standard),
        background-color var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .reason:hover {
      border-color: var(--color-border-strong);
    }
    .reason--on {
      border-color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
    }
    .reason--off {
      opacity: 0.7;
    }
    .reason__radio {
      font-weight: var(--font-weight-medium);
    }
    .reason__description {
      margin: -6px 0 0 44px;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .details {
      display: block;
      width: 100%;
    }
    .privacy {
      display: flex;
      gap: var(--spacing-2);
      margin: var(--spacing-2) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .privacy mat-icon {
      flex: 0 0 auto;
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .problem {
      display: flex;
      gap: var(--spacing-2);
      margin: var(--spacing-3) 0 0;
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-warning) 14%, var(--color-surface));
      color: var(--color-ink);
      font-size: var(--font-size-sm);
    }
    .problem mat-icon {
      flex: 0 0 auto;
    }
    .done {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--spacing-2);
      padding: var(--spacing-2) 0;
      text-align: center;
    }
    .done__icon {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--color-success) 18%, var(--color-surface));
      color: var(--color-success);
      animation: pop var(--motion-duration-base) var(--motion-easing-standard);
    }
    .done__lead {
      margin: 0;
      color: var(--color-ink);
    }
    .done__muted {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    @keyframes pop {
      from {
        transform: scale(0.6);
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .done__icon {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportCollectorDialogComponent {
  private readonly api = inject(ReportsService);
  private readonly doneButton = viewChild('done', { read: ElementRef<HTMLButtonElement> });
  protected readonly data = inject<ReportDialogData>(MAT_DIALOG_DATA);
  protected readonly reasons = inject(ReportReasonsService);

  protected readonly maxDetails = REPORT_DETAILS_MAX;
  protected readonly ids = { question: `report-q-${Math.random().toString(36).slice(2, 8)}` };
  /** One key per dialog: a double submit or a retry after a lost answer repeats the first. */
  private readonly idempotencyKey = newRequestId();

  protected readonly reason = new FormControl<string | null>(null, Validators.required);
  protected readonly details = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(REPORT_DETAILS_MAX)],
  });
  protected readonly reasonValue = toSignal(this.reason.valueChanges, { initialValue: null });
  private readonly detailsValue = toSignal(this.details.valueChanges, { initialValue: '' });
  protected readonly detailsLength = computed(() => this.detailsValue().length);

  protected readonly submitting = signal(false);
  protected readonly problem = signal<ReportProblem | null>(null);
  protected readonly sent = signal<ReportConfirmation | null>(null);
  /** An open report already exists: nothing more to send. */
  protected readonly blocked = computed(() => this.problem()?.alreadyOpen === true);
  protected readonly canConfirm = computed(
    () =>
      !!this.reasonValue() &&
      this.detailsLength() <= REPORT_DETAILS_MAX &&
      !this.submitting() &&
      !this.blocked(),
  );

  constructor() {
    void this.reasons.load();
    // The confirmation replaces the form: move focus to "Done" once it is rendered.
    afterRenderEffect(() => this.doneButton()?.nativeElement.focus());
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const reason = this.reason.value;
    if (!reason || this.details.invalid || !this.canConfirm()) {
      this.details.markAsTouched();
      return;
    }
    const details = this.details.value.trim();
    const context = this.data.context;
    const request: ReportContextRequest = {
      source: context.source as string as ReportContextRequestSourceEnum,
      ...(context.conversationId ? { conversationId: context.conversationId } : {}),
      ...(context.postId ? { postId: context.postId } : {}),
      ...(context.binderId ? { binderId: context.binderId } : {}),
    };
    this.submitting.set(true);
    this.problem.set(null);
    this.reason.disable({ emitEvent: false });
    try {
      const confirmation = await firstValueFrom(
        this.api.reportCollector(
          {
            reportCollectorRequest: {
              reportedUserId: this.data.target.id,
              reason: reason as ReportCollectorRequestReasonEnum,
              ...(details ? { details } : {}),
              context: request,
            },
            idempotencyKey: this.idempotencyKey,
          },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.sent.set(confirmation);
    } catch (error) {
      const problem = reportProblem(toApiError(error), this.data.target.displayName);
      this.problem.set(problem);
      if (!problem.alreadyOpen) {
        this.reason.enable({ emitEvent: false });
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
