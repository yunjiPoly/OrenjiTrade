import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { ModerationRule } from '@orenji/api-client';
import {
  RULE_ACTIONS,
  RULE_KINDS,
  RULE_KIND_HINTS,
  RULE_PATTERN_MAX,
  RuleAction,
  RuleKind,
  RuleScope,
  describeRate,
  ruleActionLabel,
  ruleErrors,
  ruleKindLabel,
  ruleScopeLabel,
  scopesOf,
} from './moderation-rule-labels';

export interface RuleDialogData {
  /** The rule to edit; a new rule otherwise. */
  rule?: ModerationRule;
}

export interface RuleDialogResult {
  kind: RuleKind;
  scope: RuleScope;
  pattern: string;
  action: RuleAction;
  active: boolean;
}

/**
 * Create or edit a moderation rule. The kind decides the allowed scopes and the pattern syntax
 * (a regular expression for banned terms, `<count>/<seconds>` otherwise), checked inline before
 * the API validates again. The kind of an existing rule cannot change.
 */
@Component({
  selector: 'app-rule-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.rule ? 'Edit rule' : 'New moderation rule' }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="rule">
        <mat-form-field appearance="outline">
          <mat-label>Kind</mat-label>
          <mat-select formControlName="kind">
            @for (kind of kinds; track kind) {
              <mat-option [value]="kind">{{ kindLabel(kind) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Applies to</mat-label>
          <mat-select formControlName="scope">
            @for (scope of scopes(); track scope) {
              <mat-option [value]="scope">{{ scopeLabel(scope) }}</mat-option>
            }
          </mat-select>
          @if (errors().scope; as error) {
            <mat-hint class="rule__error">{{ error }}</mat-hint>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="rule__wide">
          <mat-label>Pattern</mat-label>
          <input matInput formControlName="pattern" [attr.maxlength]="max" autocomplete="off" />
          @if (showErrors() && errors().pattern; as error) {
            <mat-hint class="rule__error" role="alert">{{ error }}</mat-hint>
          } @else {
            <mat-hint>{{ rateReading() ?? hints[kind()] }}</mat-hint>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Action</mat-label>
          <mat-select formControlName="action">
            @for (action of actions; track action) {
              <mat-option [value]="action">{{ actionLabel(action) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-slide-toggle formControlName="active" class="rule__toggle">Active</mat-slide-toggle>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">
          {{ data.rule ? 'Save rule' : 'Create rule' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .rule {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 var(--spacing-3);
    }
    .rule__wide {
      grid-column: 1 / -1;
    }
    .rule__toggle {
      align-self: center;
    }
    .rule__error {
      color: var(--color-danger);
    }
    @media (max-width: 599px) {
      .rule {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuleDialogComponent {
  private readonly ref = inject<MatDialogRef<RuleDialogComponent, RuleDialogResult>>(MatDialogRef);
  protected readonly data = inject<RuleDialogData>(MAT_DIALOG_DATA);
  protected readonly kinds = RULE_KINDS;
  protected readonly actions = RULE_ACTIONS;
  protected readonly hints = RULE_KIND_HINTS;
  protected readonly max = RULE_PATTERN_MAX;
  protected readonly kindLabel = ruleKindLabel;
  protected readonly scopeLabel = ruleScopeLabel;
  protected readonly actionLabel = ruleActionLabel;

  protected readonly form = new FormGroup({
    kind: new FormControl<RuleKind>((this.data.rule?.kind as RuleKind) ?? 'BANNED_TERM', {
      nonNullable: true,
    }),
    scope: new FormControl<RuleScope>((this.data.rule?.scope as RuleScope) ?? 'MESSAGE', {
      nonNullable: true,
    }),
    pattern: new FormControl(this.data.rule?.pattern ?? '', { nonNullable: true }),
    action: new FormControl<RuleAction>((this.data.rule?.action as RuleAction) ?? 'BLOCK', {
      nonNullable: true,
    }),
    active: new FormControl(this.data.rule?.active ?? true, { nonNullable: true }),
  });
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly kind = computed(() => (this.value().kind ?? 'BANNED_TERM') as RuleKind);
  protected readonly scopes = computed(() => scopesOf(this.kind()));
  protected readonly errors = computed(() => {
    this.value();
    return ruleErrors(this.form.getRawValue());
  });
  protected readonly showErrors = signal(false);
  protected readonly rateReading = computed(() =>
    this.kind() === 'BANNED_TERM' ? null : describeRate(this.value().pattern?.trim() ?? ''),
  );

  constructor() {
    if (this.data.rule) {
      this.form.controls.kind.disable();
    }
    this.form.controls.kind.valueChanges.subscribe((kind) => {
      const scopes = scopesOf(kind);
      if (!scopes.includes(this.form.controls.scope.value)) {
        this.form.controls.scope.setValue(scopes[0]);
      }
    });
  }

  protected submit(): void {
    this.showErrors.set(true);
    const value = this.form.getRawValue();
    const errors = ruleErrors(value);
    if (errors.pattern || errors.scope) {
      return;
    }
    this.ref.close({ ...value, pattern: value.pattern.trim() });
  }
}
