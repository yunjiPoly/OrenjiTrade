import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
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
  map,
  switchMap,
  tap,
} from 'rxjs';
import { silentErrors } from '../../core/http/http-context';
import { uniqueSuggestions } from '../catalog/card-search-box/card-search-box.component';
import {
  QUERY_MAX_LENGTH,
  SUGGEST_DEBOUNCE_MS,
  SUGGEST_MIN_CHARS,
} from '../catalog/catalog-constants';
import { gameInfo } from '../domain/games';

/** A card chosen in the picker: the card, and the printing when a printing code was chosen. */
export interface PickedCard {
  cardId: string;
  printingId: string | null;
}

type PickerStatus = 'idle' | 'loading' | 'results' | 'empty' | 'error';

/**
 * "Which card do you want?": card name or printing code with autocomplete (`GET /cards/suggest`).
 * A card suggestion means any printing; a printing suggestion preselects that printing.
 */
@Component({
  selector: 'app-wish-card-picker',
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="wcp__field">
      <mat-label>Card name or printing code</mat-label>
      <mat-icon matPrefix aria-hidden="true">search</mat-icon>
      <input
        matInput
        [formControl]="query"
        [matAutocomplete]="panel"
        [attr.maxlength]="maxLength"
        autocomplete="off"
        spellcheck="false"
        cdkFocusInitial
      />
    </mat-form-field>
    <span class="visually-hidden" aria-live="polite">{{ announcement() }}</span>
    <p class="wcp__hint">
      Type at least two letters of the name, or a printing code like AZR-EN001.
    </p>

    <mat-autocomplete
      #panel="matAutocomplete"
      class="csb-panel"
      [displayWith]="displayWith"
      (optionSelected)="choose($event)"
    >
      @for (suggestion of suggestions(); track trackKey(suggestion)) {
        <mat-option [value]="suggestion" class="csb-option">
          <span class="csb-option__row">
            <img
              class="csb-option__img"
              [src]="suggestion.imageUrl"
              alt=""
              width="36"
              height="50"
            />
            <span class="csb-option__text">
              <span class="csb-option__name">{{ suggestion.name }}</span>
              <span class="csb-option__meta">
                {{ gameLabel(suggestion.game) }}
                @if (suggestion.printingCode) {
                  · <span class="mono">{{ suggestion.printingCode }}</span>
                }
              </span>
            </span>
            @if (suggestion.kind === 'PRINTING') {
              <span class="csb-option__kind">Printing</span>
            }
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
    .wcp__field {
      width: 100%;
    }
    .wcp__hint {
      margin: var(--spacing-2) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishCardPickerComponent {
  private readonly catalog = inject(CatalogService);

  readonly picked = output<PickedCard>();

  protected readonly maxLength = QUERY_MAX_LENGTH;
  protected readonly query = new FormControl<string | CardSuggestion>('', { nonNullable: true });
  protected readonly suggestions = signal<CardSuggestion[]>([]);
  protected readonly status = signal<PickerStatus>('idle');
  protected readonly lastQuery = signal('');
  protected readonly announcement = computed(() => {
    switch (this.status()) {
      case 'results':
        return `${this.suggestions().length} suggestions available.`;
      case 'empty':
        return 'No matching cards.';
      default:
        return '';
    }
  });

  constructor() {
    this.query.valueChanges
      .pipe(
        filter((value): value is string => typeof value === 'string'),
        map((value) => value.trim().slice(0, QUERY_MAX_LENGTH)),
        tap((value) => {
          if (value.length < SUGGEST_MIN_CHARS) {
            this.suggestions.set([]);
            this.status.set('idle');
          }
        }),
        debounceTime(SUGGEST_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((q) => {
          if (q.length < SUGGEST_MIN_CHARS) {
            return EMPTY;
          }
          this.status.set('loading');
          return this.catalog
            .suggestCards({ q, limit: 10 }, 'body', false, { context: silentErrors() })
            .pipe(
              tap((items) => {
                const unique = uniqueSuggestions(items ?? []);
                this.suggestions.set(unique);
                this.lastQuery.set(q);
                this.status.set(unique.length ? 'results' : 'empty');
              }),
              catchError(() => {
                this.suggestions.set([]);
                this.status.set('error');
                return EMPTY;
              }),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected readonly displayWith = (value: string | CardSuggestion | null): string =>
    !value ? '' : typeof value === 'string' ? value : (value.name ?? '');

  protected trackKey(suggestion: CardSuggestion): string {
    return `${suggestion.kind}:${suggestion.id}:${suggestion.printingId ?? ''}`;
  }

  protected gameLabel(slug: string | null | undefined): string {
    return slug ? gameInfo(slug).label : '';
  }

  protected choose(event: MatAutocompleteSelectedEvent): void {
    const suggestion = event.option.value as CardSuggestion;
    if (!suggestion.id) {
      return;
    }
    this.picked.emit({
      cardId: suggestion.id,
      printingId: suggestion.kind === 'PRINTING' ? (suggestion.printingId ?? null) : null,
    });
  }
}
