import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
  MatAutocompleteTrigger,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { CardSuggestion, CatalogService } from '@orenji/api-client';
import {
  EMPTY,
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  map,
  switchMap,
  tap,
} from 'rxjs';
import { silentErrors } from '../../core/http/http-context';
import {
  QUERY_MAX_LENGTH,
  SUGGEST_DEBOUNCE_MS,
  SUGGEST_LIMIT,
  SUGGEST_MIN_CHARS,
} from '../catalog/catalog-constants';
import { uniqueSuggestions } from '../catalog/card-search-box/card-search-box.component';
import { gameInfo } from '../domain/games';
import { CardLinkChoice, printingForSuggestion } from './link-choices';
import { CardImageComponent } from '../ui/card-image/card-image.component';

type PickerStatus = 'idle' | 'loading' | 'results' | 'empty' | 'error';

/**
 * "Share a card": a card name or printing code with autocomplete (`GET /cards/suggest`). Choosing a
 * suggestion emits the printing to link (a card suggestion resolves to its printing with the
 * suggested code through `GET /cards/{id}`). Escape or the close button cancels.
 */
@Component({
  selector: 'app-card-link-picker',
  imports: [
    CardImageComponent,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <div class="picker">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="picker__field">
        <mat-icon matPrefix aria-hidden="true">playing_cards</mat-icon>
        <mat-label>Card to share</mat-label>
        <input
          #field
          matInput
          type="text"
          [formControl]="query"
          [matAutocomplete]="panel"
          (keydown.escape)="onEscape()"
          placeholder="Card name or printing code"
          [attr.maxlength]="maxLength"
          autocomplete="off"
          spellcheck="false"
        />
        <button
          matSuffix
          matIconButton
          type="button"
          aria-label="Cancel sharing a card"
          (click)="cancelled.emit()"
        >
          <mat-icon>close</mat-icon>
        </button>
      </mat-form-field>
      <span class="visually-hidden" aria-live="polite">{{ announcement() }}</span>
      @if (resolveError()) {
        <p class="picker__error" role="alert">{{ resolveError() }}</p>
      }
    </div>

    <mat-autocomplete
      #panel="matAutocomplete"
      [displayWith]="displayWith"
      (optionSelected)="onSelected($event)"
    >
      @for (suggestion of suggestions(); track trackKey(suggestion)) {
        <mat-option [value]="suggestion">
          <span class="picker-option">
            <app-card-image
              class="picker-option__img"
              size="xs"
              [src]="suggestion.imageUrl"
              [game]="suggestion.game"
              alt=""
            />
            <span class="picker-option__text">
              <span class="picker-option__name">{{ suggestion.name }}</span>
              <span class="picker-option__meta">
                {{ gameLabel(suggestion.game) }}
                @if (suggestion.printingCode) {
                  · <span class="mono">{{ suggestion.printingCode }}</span>
                }
              </span>
            </span>
          </span>
        </mat-option>
      }
      @if (status() === 'empty') {
        <mat-option disabled>No cards match “{{ lastQuery() }}”.</mat-option>
      }
      @if (status() === 'error') {
        <mat-option disabled>Suggestions are unavailable. Try again.</mat-option>
      }
    </mat-autocomplete>
  `,
  styles: `
    :host {
      display: block;
    }
    .picker__field {
      width: 100%;
    }
    .picker__error {
      margin: var(--spacing-1) 0 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    .picker-option {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
    }
    .picker-option__img {
      flex: 0 0 30px;
      width: 30px;
    }
    .picker-option__text {
      display: flex;
      flex-direction: column;
      line-height: 1.25;
    }
    .picker-option__name {
      font-weight: var(--font-weight-medium);
    }
    .picker-option__meta {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardLinkPickerComponent {
  private readonly api = inject(CatalogService);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly trigger = viewChild(MatAutocompleteTrigger);

  readonly picked = output<CardLinkChoice>();
  readonly cancelled = output<void>();

  protected readonly maxLength = QUERY_MAX_LENGTH;
  protected readonly query = new FormControl<string | CardSuggestion>('', { nonNullable: true });
  protected readonly suggestions = signal<CardSuggestion[]>([]);
  protected readonly status = signal<PickerStatus>('idle');
  protected readonly lastQuery = signal('');
  protected readonly resolveError = signal<string | null>(null);
  protected readonly announcement = signal('');

  constructor() {
    afterNextRender(() => this.field()?.nativeElement.focus());
    this.query.valueChanges
      .pipe(
        filter((value): value is string => typeof value === 'string'),
        map((value) => value.trim().slice(0, QUERY_MAX_LENGTH)),
        tap((value) => {
          if (value.length < SUGGEST_MIN_CHARS) {
            this.suggestions.set([]);
            this.status.set('idle');
            this.announcement.set('');
          }
        }),
        debounceTime(SUGGEST_DEBOUNCE_MS),
        distinctUntilChanged(),
        filter((q) => q.length >= SUGGEST_MIN_CHARS),
        switchMap((q) => {
          this.status.set('loading');
          return this.api
            .suggestCards({ q, limit: SUGGEST_LIMIT }, 'body', false, { context: silentErrors() })
            .pipe(
              tap((items) => {
                const unique = uniqueSuggestions(items ?? []);
                this.suggestions.set(unique);
                this.lastQuery.set(q);
                this.status.set(unique.length ? 'results' : 'empty');
                this.announcement.set(
                  unique.length
                    ? `${unique.length} ${unique.length === 1 ? 'card' : 'cards'} found.`
                    : 'No matching cards.',
                );
              }),
              catchError(() => {
                this.suggestions.set([]);
                this.lastQuery.set(q);
                this.status.set('error');
                return EMPTY;
              }),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  /** Escape closes the suggestions first, then cancels the picker. */
  protected onEscape(): void {
    if (!this.trigger()?.panelOpen) {
      this.cancelled.emit();
    }
  }

  protected readonly displayWith = (value: string | CardSuggestion | null): string =>
    !value ? '' : typeof value === 'string' ? value : (value.name ?? '');

  protected trackKey(suggestion: CardSuggestion): string {
    return `${suggestion.kind}:${suggestion.id}:${suggestion.printingId ?? ''}`;
  }

  protected gameLabel(slug: string | undefined): string {
    return slug ? gameInfo(slug).shortLabel : '';
  }

  protected async onSelected(event: MatAutocompleteSelectedEvent): Promise<void> {
    const suggestion = event.option.value as CardSuggestion;
    this.resolveError.set(null);
    let printingId = printingForSuggestion(suggestion, null);
    if (!printingId && suggestion.id) {
      try {
        const card = await firstValueFrom(
          this.api.getCard({ id: suggestion.id }, 'body', false, { context: silentErrors() }),
        );
        printingId = printingForSuggestion(suggestion, card);
      } catch {
        printingId = null;
      }
    }
    if (!printingId || !suggestion.id) {
      this.resolveError.set('This card cannot be shared right now. Try another printing.');
      return;
    }
    this.picked.emit({
      printingId,
      cardId: suggestion.id,
      name: suggestion.name ?? 'Card',
      printingCode: suggestion.printingCode ?? null,
      imageUrl: suggestion.imageUrl ?? null,
      game: suggestion.game ?? null,
    });
  }
}
