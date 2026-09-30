import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import type { DelistPolicyResponse, UpdateDelistPolicyRequest } from '@orenji/api-client';
import {
  DELIST_LIMITS,
  DelistPolicyField,
  DelistPolicyValue,
  delistPolicyErrors,
  freshnessStages,
} from './delist-policy-validation';

type NumberControl = FormControl<number | null>;

interface FieldInfo {
  key: Exclude<DelistPolicyField, 'name'>;
  label: string;
  suffix: string;
  hint: string;
}

const FRESHNESS_FIELDS: readonly FieldInfo[] = [
  {
    key: 'agingAfterDays',
    label: 'Aging after',
    suffix: 'days',
    hint: 'Listings show “aging” once unconfirmed this long.',
  },
  {
    key: 'staleAfterDays',
    label: 'Stale after',
    suffix: 'days',
    hint: 'Stale listings rank last on the map and in search.',
  },
  {
    key: 'hiddenAfterDays',
    label: 'Hidden after',
    suffix: 'days',
    hint: 'Hidden listings leave public views until confirmed.',
  },
  {
    key: 'warnBeforeHiddenDays',
    label: 'Warn before hiding',
    suffix: 'days',
    hint: 'The owner gets a reminder this many days before.',
  },
];

const RESPONSIVENESS_FIELDS: readonly FieldInfo[] = [
  {
    key: 'unansweredAfterHours',
    label: 'Unanswered after',
    suffix: 'hours',
    hint: 'A conversation waiting this long counts as a strike.',
  },
  {
    key: 'maxStrikes',
    label: 'Strikes before pausing',
    suffix: 'strikes',
    hint: 'Public listings pause until the owner confirms they are available.',
  },
];

/**
 * Editor of one auto-delist policy: the freshness thresholds with a live timeline preview, and
 * the unresponsiveness rules (strikes). Validation mirrors the API (aging < stale < hidden…);
 * emits the request once valid. The parent confirms and saves.
 */
@Component({
  selector: 'app-delist-policy-editor',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="policy">
      <div class="policy__head">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="policy__name">
          <mat-label>Policy name</mat-label>
          <input matInput formControlName="name" [attr.maxlength]="limits.nameMax" />
        </mat-form-field>
        @if (policy().active) {
          <span class="policy__active"
            ><mat-icon aria-hidden="true">check_circle</mat-icon>Active</span
          >
        }
      </div>

      <h3 class="policy__section">Listing freshness</h3>
      <div
        class="timeline"
        role="img"
        [attr.aria-label]="timelineLabel()"
        data-testid="delist-timeline"
      >
        @for (stage of stages(); track stage.key) {
          <span
            class="timeline__stage"
            [attr.data-stage]="stage.key"
            [style.flex-basis.%]="stage.share"
          >
            <strong>{{ stage.label }}</strong>
            <small>{{ stage.range }}</small>
          </span>
        } @empty {
          <span class="timeline__invalid">Fix the thresholds to preview the timeline.</span>
        }
      </div>
      <div class="policy__grid">
        @for (field of freshnessFields; track field.key) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ field.label }}</mat-label>
            <input matInput type="number" min="0" step="1" [formControlName]="field.key" />
            <span matTextSuffix>&nbsp;{{ field.suffix }}</span>
            @if (errors()[field.key]; as error) {
              <mat-hint class="policy__error">{{ error }}</mat-hint>
            } @else {
              <mat-hint>{{ field.hint }}</mat-hint>
            }
          </mat-form-field>
        }
      </div>

      <h3 class="policy__section">Unanswered conversations</h3>
      <div class="policy__grid">
        @for (field of responsivenessFields; track field.key) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ field.label }}</mat-label>
            <input matInput type="number" min="0" step="1" [formControlName]="field.key" />
            <span matTextSuffix>&nbsp;{{ field.suffix }}</span>
            @if (errors()[field.key]; as error) {
              <mat-hint class="policy__error">{{ error }}</mat-hint>
            } @else {
              <mat-hint>{{ field.hint }}</mat-hint>
            }
          </mat-form-field>
        }
      </div>

      <div class="policy__actions">
        @if (showErrors() && hasErrors()) {
          <p class="policy__error" role="alert">Fix the highlighted values before saving.</p>
        }
        <button matButton type="button" [disabled]="!dirty() || busy()" (click)="reset()">
          Reset
        </button>
        <button matButton="filled" type="submit" [disabled]="!dirty() || busy()">
          {{ busy() ? 'Saving…' : 'Save rules' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    :host {
      display: block;
    }
    .policy__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-3);
    }
    .policy__name {
      flex: 0 1 320px;
    }
    .policy__active {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--color-success);
      font-weight: var(--font-weight-semibold);
    }
    .policy__section {
      margin: var(--spacing-5) 0 var(--spacing-2);
      font-size: var(--font-size-md);
    }
    .timeline {
      display: flex;
      overflow: hidden;
      margin-bottom: var(--spacing-3);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      min-height: 52px;
    }
    .timeline__stage {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 72px;
      padding: var(--spacing-1) var(--spacing-2);
      font-size: var(--font-size-xs);
      transition: flex-basis var(--motion-duration-base) var(--motion-easing-standard);
    }
    .timeline__stage strong {
      font-size: var(--font-size-sm);
    }
    .timeline__stage[data-stage='ACTIVE'] {
      background: color-mix(in srgb, var(--color-status-fresh) 22%, var(--color-surface));
    }
    .timeline__stage[data-stage='AGING'] {
      background: color-mix(in srgb, var(--color-status-aging) 22%, var(--color-surface));
    }
    .timeline__stage[data-stage='STALE'] {
      background: color-mix(in srgb, var(--color-status-stale) 22%, var(--color-surface));
    }
    .timeline__stage[data-stage='HIDDEN'] {
      background: color-mix(in srgb, var(--color-status-hidden) 22%, var(--color-surface));
    }
    .timeline__invalid {
      align-self: center;
      padding: 0 var(--spacing-3);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .policy__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: var(--spacing-1) var(--spacing-3);
    }
    .policy__error {
      color: var(--color-danger);
    }
    .policy__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: var(--spacing-2);
      margin-top: var(--spacing-4);
    }
    .policy__actions p {
      margin: 0 auto 0 0;
      font-size: var(--font-size-sm);
    }
    @media (prefers-reduced-motion: reduce) {
      .timeline__stage {
        transition: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DelistPolicyEditorComponent {
  readonly policy = input.required<DelistPolicyResponse>();
  readonly busy = input(false);
  readonly save = output<UpdateDelistPolicyRequest>();

  protected readonly limits = DELIST_LIMITS;
  protected readonly freshnessFields = FRESHNESS_FIELDS;
  protected readonly responsivenessFields = RESPONSIVENESS_FIELDS;
  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    agingAfterDays: new FormControl<number | null>(null) as NumberControl,
    staleAfterDays: new FormControl<number | null>(null) as NumberControl,
    hiddenAfterDays: new FormControl<number | null>(null) as NumberControl,
    warnBeforeHiddenDays: new FormControl<number | null>(null) as NumberControl,
    maxStrikes: new FormControl<number | null>(null) as NumberControl,
    unansweredAfterHours: new FormControl<number | null>(null) as NumberControl,
  });
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  private readonly current = computed<DelistPolicyValue>(() => {
    this.value();
    return this.form.getRawValue();
  });
  protected readonly errors = computed(() => delistPolicyErrors(this.current()));
  protected readonly hasErrors = computed(() => Object.keys(this.errors()).length > 0);
  protected readonly stages = computed(() => freshnessStages(this.current()));
  protected readonly timelineLabel = computed(() => {
    const stages = this.stages();
    return stages.length
      ? 'Freshness timeline: ' + stages.map((stage) => `${stage.label} ${stage.range}`).join(', ')
      : 'Freshness timeline unavailable until the thresholds are valid';
  });
  protected readonly dirty = computed(() => {
    const policy = this.policy();
    const value = this.current();
    return (
      value.name.trim() !== policy.name ||
      value.agingAfterDays !== policy.agingAfterDays ||
      value.staleAfterDays !== policy.staleAfterDays ||
      value.hiddenAfterDays !== policy.hiddenAfterDays ||
      value.warnBeforeHiddenDays !== policy.warnBeforeHiddenDays ||
      value.maxStrikes !== policy.maxStrikes ||
      value.unansweredAfterHours !== policy.unansweredAfterHours
    );
  });
  protected readonly showErrors = signal(false);

  constructor() {
    effect(() => {
      const policy = this.policy();
      untracked(() => this.fill(policy));
    });
  }

  protected reset(): void {
    this.fill(this.policy());
  }

  protected submit(): void {
    this.showErrors.set(true);
    const value = this.form.getRawValue();
    if (this.hasErrors()) {
      return;
    }
    this.save.emit({
      name: value.name.trim() || this.policy().name,
      agingAfterDays: value.agingAfterDays as number,
      staleAfterDays: value.staleAfterDays as number,
      hiddenAfterDays: value.hiddenAfterDays as number,
      warnBeforeHiddenDays: value.warnBeforeHiddenDays as number,
      maxStrikes: value.maxStrikes as number,
      unansweredAfterHours: value.unansweredAfterHours as number,
    });
  }

  private fill(policy: DelistPolicyResponse): void {
    this.showErrors.set(false);
    this.form.setValue({
      name: policy.name,
      agingAfterDays: policy.agingAfterDays,
      staleAfterDays: policy.staleAfterDays,
      hiddenAfterDays: policy.hiddenAfterDays,
      warnBeforeHiddenDays: policy.warnBeforeHiddenDays,
      maxStrikes: policy.maxStrikes,
      unansweredAfterHours: policy.unansweredAfterHours,
    });
  }
}
