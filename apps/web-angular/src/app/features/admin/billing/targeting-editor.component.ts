import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { AdTargeting, AdTargetingRule } from '@orenji/api-client';
import {
  LIMITS,
  TARGETING_KINDS,
  targetingHint,
  targetingLabel,
  targetingValueError,
} from './admin-billing-labels';

interface RuleRow {
  key: number;
  kind: string;
  value: string;
}

/**
 * Edits a campaign's targeting rules: kinds combine with AND, values of one kind with OR; no
 * rule targets everybody. Geography is only a public region label or grid cell, never
 * coordinates. Emits the whole list on save (`PUT …/targeting`).
 */
@Component({
  selector: 'app-targeting-editor',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <p class="targeting__summary" data-testid="targeting-summary">{{ summary() }}</p>
    @if (rows().length) {
      <ul class="targeting__rules" aria-label="Targeting rules">
        @for (row of rows(); track row.key; let index = $index) {
          <li class="targeting__rule">
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="targeting__kind">
              <mat-label>Kind</mat-label>
              <mat-select
                [ngModel]="row.kind"
                (ngModelChange)="update(index, { kind: $event })"
                [disabled]="!editable()"
              >
                @for (kind of kinds; track kind) {
                  <mat-option [value]="kind">{{ label(kind) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="targeting__value">
              <mat-label>Value</mat-label>
              <input
                matInput
                [ngModel]="row.value"
                (ngModelChange)="update(index, { value: $event })"
                [attr.maxlength]="max"
                [readonly]="!editable()"
                [attr.aria-invalid]="!!error(row)"
              />
              @if (error(row); as message) {
                <mat-hint class="targeting__error">{{ message }}</mat-hint>
              } @else {
                <mat-hint>{{ hint(row.kind) }}</mat-hint>
              }
            </mat-form-field>
            @if (editable()) {
              <button
                matIconButton
                type="button"
                [attr.aria-label]="'Remove rule ' + label(row.kind) + ' ' + row.value"
                (click)="remove(index)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            }
          </li>
        }
      </ul>
    }
    @if (editable()) {
      <div class="targeting__actions">
        <button matButton type="button" (click)="add()" [disabled]="rows().length >= maxRules">
          <mat-icon aria-hidden="true">add</mat-icon>
          Add rule
        </button>
        <button
          matButton="filled"
          type="button"
          [disabled]="!dirty() || invalid() || busy()"
          (click)="submit()"
        >
          Save targeting
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .targeting__summary {
      margin: 0 0 var(--spacing-3);
      color: var(--color-text-muted);
    }
    .targeting__rules {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      margin: 0 0 var(--spacing-3);
      padding: 0;
      list-style: none;
    }
    .targeting__rule {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: var(--spacing-2);
    }
    .targeting__kind {
      flex: 0 1 170px;
    }
    .targeting__value {
      flex: 1 1 240px;
    }
    .targeting__error {
      color: var(--color-danger);
    }
    .targeting__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TargetingEditorComponent {
  readonly rules = input.required<readonly AdTargeting[]>();
  readonly editable = input(true);
  readonly busy = input(false);

  readonly save = output<AdTargetingRule[]>();

  protected readonly kinds = TARGETING_KINDS;
  protected readonly max = LIMITS.targetingValue;
  protected readonly maxRules = LIMITS.targetingRules;
  protected readonly label = targetingLabel;
  protected readonly hint = targetingHint;
  protected readonly rows = signal<RuleRow[]>([]);
  protected readonly dirty = signal(false);
  protected readonly invalid = computed(() =>
    this.rows().some((row) => targetingValueError(row.kind, row.value) !== null),
  );
  protected readonly summary = computed(() => {
    const rows = this.rows();
    if (!rows.length) {
      return 'No rules: the campaign targets everybody.';
    }
    const byKind = new Map<string, string[]>();
    for (const row of rows) {
      byKind.set(row.kind, [...(byKind.get(row.kind) ?? []), row.value.trim() || '…']);
    }
    return `Shown when ${[...byKind.entries()]
      .map(([kind, values]) => `${targetingLabel(kind).toLowerCase()} is ${values.join(' or ')}`)
      .join(', and ')}.`;
  });

  private nextKey = 0;

  constructor() {
    effect(() => {
      const rules = this.rules();
      this.rows.set(
        rules.map((rule) => ({
          key: this.nextKey++,
          kind: rule.kind ?? 'GAME',
          value: rule.value ?? '',
        })),
      );
      this.dirty.set(false);
    });
  }

  protected error(row: RuleRow): string | null {
    return row.value || this.dirty() ? targetingValueError(row.kind, row.value) : null;
  }

  protected add(): void {
    this.rows.update((rows) => [...rows, { key: this.nextKey++, kind: 'GAME', value: '' }]);
    this.dirty.set(true);
  }

  protected remove(index: number): void {
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
    this.dirty.set(true);
  }

  protected update(index: number, change: Partial<RuleRow>): void {
    this.rows.update((rows) => rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
    this.dirty.set(true);
  }

  protected submit(): void {
    if (this.invalid()) {
      return;
    }
    this.save.emit(
      this.rows().map((row) => ({
        kind: row.kind as AdTargetingRule['kind'],
        value: row.value.trim(),
      })),
    );
  }
}
