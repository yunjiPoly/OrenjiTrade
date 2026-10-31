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
import { MatIconModule } from '@angular/material/icon';
import { GameRequest, GameRequestStatusEnum, GameResponse } from '@orenji/api-client';
import { map, startWith } from 'rxjs';
import { GameSchemaPreviewComponent } from './game-schema-preview.component';
import {
  formatSchema,
  gameSchemaValidator,
  validateGameSchemaJson,
} from './game-schema-validation';

/** The API's slug rule: lower-case letters and digits separated by dashes. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Edit form of one game: names, publisher, status (HIDDEN removes it everywhere public), display
 * order and its `GameSchema` as JSON with live validation and a preview. The slug never changes.
 */
@Component({
  selector: 'app-game-editor',
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, GameSchemaPreviewComponent],
  styleUrls: ['../console/console-form.scss'],
  template: `
    <form class="editor" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      @if (creating()) {
        <div class="cf">
          <div class="cf__top">
            <label class="cf__label" for="game-slug">Slug</label>
            <span class="cf__count" aria-hidden="true"
              >{{ form.controls.slug.value.length }} / 32</span
            >
          </div>
          <input
            id="game-slug"
            class="cf__control mono"
            formControlName="slug"
            maxlength="32"
            autocomplete="off"
            [attr.aria-invalid]="!!slugError()"
            aria-describedby="game-slug-help"
          />
          @if (slugError(); as error) {
            <p class="cf__error" id="game-slug-help">{{ error }}</p>
          } @else {
            <p class="cf__help" id="game-slug-help">
              Lower-case letters and digits with dashes, like lorcana. It never changes.
            </p>
          }
        </div>
      }
      <div class="cf-row">
        <div class="cf">
          <div class="cf__top">
            <label class="cf__label" for="game-name">Name</label>
            <span class="cf__count" aria-hidden="true"
              >{{ form.controls.name.value.length }} / 120</span
            >
          </div>
          <input
            id="game-name"
            class="cf__control"
            formControlName="name"
            maxlength="120"
            [attr.aria-invalid]="shows('name')"
            [attr.aria-describedby]="shows('name') ? 'game-name-error' : null"
          />
          @if (shows('name')) {
            <p class="cf__error" id="game-name-error">A name is required.</p>
          }
        </div>
        <div class="cf">
          <div class="cf__top">
            <label class="cf__label" for="game-short">Short name</label>
            <span class="cf__count" aria-hidden="true"
              >{{ form.controls.shortName.value.length }} / 40</span
            >
          </div>
          <input
            id="game-short"
            class="cf__control"
            formControlName="shortName"
            maxlength="40"
            [attr.aria-invalid]="shows('shortName')"
            aria-describedby="game-short-help"
          />
          @if (shows('shortName')) {
            <p class="cf__error" id="game-short-help">A short name is required.</p>
          } @else {
            <p class="cf__help" id="game-short-help">Shown on tiles, chips and filters.</p>
          }
        </div>
        <div class="cf">
          <div class="cf__top">
            <label class="cf__label" for="game-publisher">Publisher</label>
            <span class="cf__count" aria-hidden="true"
              >{{ form.controls.publisher.value.length }} / 120</span
            >
          </div>
          <input
            id="game-publisher"
            class="cf__control"
            formControlName="publisher"
            maxlength="120"
            [attr.aria-invalid]="shows('publisher')"
            [attr.aria-describedby]="shows('publisher') ? 'game-publisher-error' : null"
          />
          @if (shows('publisher')) {
            <p class="cf__error" id="game-publisher-error">A publisher is required.</p>
          }
        </div>
      </div>
      <div class="cf editor__order">
        <label class="cf__label" for="game-order">Display order</label>
        <input
          id="game-order"
          class="cf__control"
          type="number"
          formControlName="sortOrder"
          min="0"
          step="1"
          [attr.aria-invalid]="shows('sortOrder')"
          aria-describedby="game-order-help"
        />
        @if (shows('sortOrder')) {
          <p class="cf__error" id="game-order-help">Use a whole number from 0.</p>
        } @else {
          <p class="cf__help" id="game-order-help">Lower comes first in every game picker.</p>
        }
      </div>
      <fieldset class="cf-choices">
        <legend>Status</legend>
        <label class="cf-choice" [class.cf-choice--on]="form.controls.status.value === 'ACTIVE'">
          <input type="radio" formControlName="status" value="ACTIVE" />
          <span>
            <strong>Active</strong>
            <span class="cf__help">Shown in the catalog and profile choices.</span>
          </span>
        </label>
        <label class="cf-choice" [class.cf-choice--on]="form.controls.status.value === 'HIDDEN'">
          <input type="radio" formControlName="status" value="HIDDEN" />
          <span>
            <strong>Hidden</strong>
            <span class="cf__help">Disappears from the catalog and profile choices.</span>
          </span>
        </label>
      </fieldset>

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
          {{ saving() ? 'Saving…' : creating() ? 'Create game' : 'Save game' }}
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
      gap: 18px;
    }
    .editor__order {
      max-width: 240px;
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
  /** "New game" (`POST /admin/games`, board A13): a slug field and "Create game". */
  readonly creating = input(false, { transform: booleanAttribute });
  /** Field errors from the API (`VALIDATION_FAILED`), by field path. */
  readonly serverErrors = input<Record<string, string>>({});
  readonly save = output<GameRequest>();

  protected readonly form = inject(FormBuilder).nonNullable.group({
    slug: ['', [Validators.minLength(2), Validators.maxLength(32), Validators.pattern(SLUG)]],
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

  /** Statuses (touched or a save tried), so each field's error shows as Material's did. */
  private readonly statuses = toSignal(this.form.events.pipe(map(() => this.form.value)), {
    initialValue: null,
  });

  constructor() {
    effect(() => {
      const game = this.game();
      untracked(() => this.fill(game));
    });
  }

  /** A field's error shows once it was touched or a save was tried. */
  protected shows(name: 'name' | 'shortName' | 'publisher' | 'sortOrder'): boolean {
    this.statuses();
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  /** The slug's error, its rule first, then the API's answer (New game). */
  protected slugError(): string | null {
    this.statuses();
    const slug = this.form.controls.slug;
    if (slug.touched && slug.hasError('required')) {
      return 'A slug is required.';
    }
    if (slug.touched && slug.invalid) {
      return 'Use 2 to 32 lower-case letters and digits separated by dashes.';
    }
    return this.serverErrors()['slug'] ?? null;
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
    if (this.creating() && !this.form.controls.slug.value.trim()) {
      // A new game needs a slug (the other fields' errors show at the same time).
      this.form.controls.slug.setErrors({ required: true });
    }
    const { schema } = validateGameSchemaJson(this.form.controls.schema.value);
    if (this.form.invalid || !schema) {
      return;
    }
    const value = this.form.getRawValue();
    this.save.emit({
      ...(this.creating() ? { slug: value.slug.trim() } : {}),
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
      slug: game.slug ?? '',
      name: game.name ?? '',
      shortName: game.shortName ?? '',
      publisher: game.publisher ?? '',
      status: (game.status as unknown as GameRequestStatusEnum) ?? GameRequestStatusEnum.Active,
      sortOrder: game.sortOrder ?? 0,
      schema: formatSchema(game.schema),
    });
  }
}
