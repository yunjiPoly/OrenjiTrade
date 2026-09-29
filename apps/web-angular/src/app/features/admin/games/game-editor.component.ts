import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { GameRequest, GameRequestStatusEnum, GameResponse } from '@orenji/api-client';
import { map, startWith } from 'rxjs';
import { GameSchemaPreviewComponent } from './game-schema-preview.component';
import {
  formatSchema,
  gameSchemaValidator,
  validateGameSchemaJson,
} from './game-schema-validation';

/**
 * Edit form of one game: names, publisher, status (HIDDEN removes it everywhere public), display
 * order and its `GameSchema` as JSON with live validation and a preview. The slug never changes.
 */
@Component({
  selector: 'app-game-editor',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    GameSchemaPreviewComponent,
  ],
  template: `
    <form class="editor" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="editor__row">
        <mat-form-field appearance="outline">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" maxlength="120" />
          @if (form.controls.name.hasError('required')) {
            <mat-error>A name is required.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Short name</mat-label>
          <input matInput formControlName="shortName" maxlength="40" />
          @if (form.controls.shortName.hasError('required')) {
            <mat-error>A short name is required.</mat-error>
          }
        </mat-form-field>
      </div>
      <div class="editor__row">
        <mat-form-field appearance="outline">
          <mat-label>Publisher</mat-label>
          <input matInput formControlName="publisher" maxlength="120" />
          @if (form.controls.publisher.hasError('required')) {
            <mat-error>A publisher is required.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Status</mat-label>
          <mat-select formControlName="status">
            <mat-option value="ACTIVE">Active</mat-option>
            <mat-option value="HIDDEN">Hidden</mat-option>
          </mat-select>
          <mat-hint>Hidden games disappear from the catalog and profile choices.</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline" class="editor__order">
          <mat-label>Display order</mat-label>
          <input matInput type="number" formControlName="sortOrder" min="0" step="1" />
          @if (form.controls.sortOrder.invalid) {
            <mat-error>Use a whole number from 0.</mat-error>
          }
        </mat-form-field>
      </div>

      <div class="editor__schema">
        <div class="editor__schema-head">
          <label class="editor__label" for="game-schema-json">Schema (JSON)</label>
          <button matButton type="button" (click)="format()" [disabled]="!schemaValid()">
            <mat-icon aria-hidden="true">format_align_left</mat-icon>
            Format
          </button>
        </div>
        <textarea
          id="game-schema-json"
          class="editor__json mono"
          formControlName="schema"
          rows="18"
          spellcheck="false"
          autocapitalize="off"
          [attr.aria-invalid]="!schemaValid()"
          aria-describedby="game-schema-errors"
        ></textarea>
        <div id="game-schema-errors" aria-live="polite">
          @if (schemaErrors().length) {
            <ul class="editor__errors" role="alert">
              @for (message of schemaErrors(); track message) {
                <li>{{ message }}</li>
              }
            </ul>
          } @else {
            <p class="editor__ok">
              <mat-icon aria-hidden="true">check_circle</mat-icon>
              Valid schema
            </p>
          }
        </div>
      </div>

      <details class="editor__preview" open>
        <summary>Preview</summary>
        <app-game-schema-preview [schema]="preview()" />
      </details>

      <div class="editor__actions">
        <button matButton type="button" (click)="reset()" [disabled]="saving() || form.pristine">
          Discard changes
        </button>
        <button matButton="filled" type="submit" [disabled]="saving()">
          <mat-icon aria-hidden="true">save</mat-icon>
          {{ saving() ? 'Saving…' : 'Save game' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    :host {
      display: block;
    }
    .editor {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
    }
    .editor__row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-3);
    }
    .editor__row mat-form-field {
      flex: 1 1 200px;
    }
    .editor__order {
      max-width: 160px;
    }
    .editor__schema-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .editor__label {
      font-weight: var(--font-weight-semibold);
    }
    .editor__json {
      width: 100%;
      padding: var(--spacing-3);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      line-height: 1.5;
      resize: vertical;
    }
    .editor__json[aria-invalid='true'] {
      border-color: var(--color-danger);
    }
    .editor__errors {
      margin: var(--spacing-2) 0 0;
      padding-left: var(--spacing-5);
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    .editor__ok {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      margin: var(--spacing-2) 0 0;
      color: var(--color-success);
      font-size: var(--font-size-sm);
    }
    .editor__preview summary {
      cursor: pointer;
      font-weight: var(--font-weight-semibold);
      margin-bottom: var(--spacing-2);
    }
    .editor__actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--spacing-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameEditorComponent {
  readonly game = input.required<GameResponse>();
  readonly saving = input(false, { transform: booleanAttribute });
  /** Field errors from the API (`VALIDATION_FAILED`), by field path. */
  readonly serverErrors = input<Record<string, string>>({});
  readonly save = output<GameRequest>();

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    shortName: ['', [Validators.required, Validators.maxLength(40)]],
    publisher: ['', [Validators.required, Validators.maxLength(120)]],
    status: ['ACTIVE' as GameRequestStatusEnum, Validators.required],
    sortOrder: [0, [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]],
    schema: ['', gameSchemaValidator()],
  });

  private readonly schemaText = toSignal(
    this.form.controls.schema.valueChanges.pipe(
      startWith(this.form.controls.schema.value),
      map((value) => value ?? ''),
    ),
    { initialValue: '' },
  );
  private readonly validation = computed(() => validateGameSchemaJson(this.schemaText()));
  protected readonly preview = computed(() => this.validation().schema);
  protected readonly schemaValid = computed(() => this.validation().errors.length === 0);
  protected readonly schemaErrors = computed(() => {
    const server = Object.entries(this.serverErrors())
      .filter(([field]) => field.startsWith('schema'))
      .map(([field, message]) => `${field}: ${message}`);
    return [...this.validation().errors, ...server];
  });

  constructor() {
    effect(() => {
      const game = this.game();
      untracked(() => this.fill(game));
    });
  }

  protected reset(): void {
    this.fill(this.game());
  }

  protected format(): void {
    const { schema } = validateGameSchemaJson(this.form.controls.schema.value);
    if (schema) {
      this.form.controls.schema.setValue(formatSchema(schema));
      this.form.controls.schema.markAsDirty();
    }
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    const { schema } = validateGameSchemaJson(this.form.controls.schema.value);
    if (this.form.invalid || !schema) {
      return;
    }
    const value = this.form.getRawValue();
    this.save.emit({
      name: value.name.trim(),
      shortName: value.shortName.trim(),
      publisher: value.publisher.trim(),
      status: value.status,
      sortOrder: Number(value.sortOrder),
      schema,
    });
  }

  private fill(game: GameResponse): void {
    this.form.reset({
      name: game.name ?? '',
      shortName: game.shortName ?? '',
      publisher: game.publisher ?? '',
      status: (game.status as unknown as GameRequestStatusEnum) ?? GameRequestStatusEnum.Active,
      sortOrder: game.sortOrder ?? 0,
      schema: formatSchema(game.schema),
    });
  }
}
