import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
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
import { Router } from '@angular/router';
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
import { silentErrors } from '../../../core/http/http-context';
import { gameInfo } from '../../domain/games';
import {
  QUERY_MAX_LENGTH,
  SUGGEST_DEBOUNCE_MS,
  SUGGEST_LIMIT,
  SUGGEST_MIN_CHARS,
} from '../catalog-constants';

/** The "see all results" row of the panel. */
interface SeeAllOption {
  kind: 'SEE_ALL';
  query: string;
}

type SearchValue = string | CardSuggestion | SeeAllOption;

export type SuggestStatus = 'idle' | 'loading' | 'results' | 'empty' | 'error';

/**
 * Printings of one card that share a printing code (1st Edition and Unlimited `AZR-EN011`) lead
 * to the same card page and read the same: keep the first of each.
 */
export function uniqueSuggestions(items: readonly CardSuggestion[]): CardSuggestion[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}|${item.id}|${item.printingCode ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isSeeAll(value: unknown): value is SeeAllOption {
  return !!value && typeof value === 'object' && (value as SeeAllOption).kind === 'SEE_ALL';
}

/**
 * Card search with autocomplete (`GET /cards/suggest`, debounced): card names and printing codes
 * with image, game, set and printing code. Arrow keys move through the suggestions, Enter opens
 * the highlighted card (a printing suggestion opens its card with that printing selected), and
 * Enter without a highlighted suggestion searches the catalog (`/cards?q=`).
 */
@Component({
  selector: 'app-card-search-box',
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <form class="csb" role="search" [attr.aria-label]="label()" (submit)="submit($event)">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="csb__field">
        <mat-icon matPrefix aria-hidden="true">search</mat-icon>
        <input
          matInput
          type="text"
          [formControl]="query"
          [matAutocomplete]="panel"
          [placeholder]="placeholder()"
          [attr.aria-label]="label()"
          [attr.maxlength]="maxLength"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="search"
        />
        @if (status() === 'loading') {
          <span matSuffix class="csb__spinner" aria-hidden="true"></span>
        } @else if (hasText()) {
          <button matSuffix matIconButton type="button" aria-label="Clear search" (click)="clear()">
            <mat-icon>close</mat-icon>
          </button>
        }
      </mat-form-field>
      <span class="visually-hidden" aria-live="polite">{{ announcement() }}</span>
    </form>

    <mat-autocomplete
      #panel="matAutocomplete"
      class="csb-panel"
      [displayWith]="displayWith"
      (optionSelected)="onSelected($event)"
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
              loading="lazy"
            />
            <span class="csb-option__text">
              <span class="csb-option__name">{{ suggestion.name }}</span>
              <span class="csb-option__meta">
                {{ gameLabel(suggestion.game) }}
                @if (suggestion.setCode) {
                  · {{ suggestion.setCode }}
                }
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
        <mat-option disabled class="csb-option--info"
          >No cards match “{{ lastQuery() }}”.</mat-option
        >
      }
      @if (status() === 'error') {
        <mat-option disabled class="csb-option--info">
          Suggestions are unavailable. Press Enter to search.
        </mat-option>
      }
      @if (seeAll(); as option) {
        <mat-option [value]="option" class="csb-option--all">
          <mat-icon aria-hidden="true">manage_search</mat-icon>
          See all results for “{{ option.query }}”
        </mat-option>
      }
    </mat-autocomplete>
  `,
  styles: `
    :host {
      display: block;
    }
    .csb__field {
      width: 100%;
    }
    .csb__spinner {
      display: inline-block;
      width: 18px;
      height: 18px;
      margin: 0 var(--spacing-3);
      border: 2px solid var(--color-border);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: csb-spin 0.8s linear infinite;
    }
    @keyframes csb-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardSearchBoxComponent {
  private readonly api = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly trigger = viewChild(MatAutocompleteTrigger);

  readonly label = input('Search cards');
  readonly placeholder = input('Search cards or printing codes');
  /** Restricts suggestions to one game. */
  readonly game = input<string | undefined>(undefined);

  protected readonly maxLength = QUERY_MAX_LENGTH;
  protected readonly query = new FormControl<SearchValue>('', { nonNullable: true });
  protected readonly suggestions = signal<CardSuggestion[]>([]);
  protected readonly status = signal<SuggestStatus>('idle');
  protected readonly lastQuery = signal('');
  protected readonly text = signal('');
  protected readonly hasText = computed(() => this.text().length > 0);
  protected readonly seeAll = computed<SeeAllOption | null>(() => {
    const status = this.status();
    const query = this.lastQuery();
    return query && (status === 'results' || status === 'empty')
      ? { kind: 'SEE_ALL', query }
      : null;
  });
  protected readonly announcement = computed(() => {
    switch (this.status()) {
      case 'results': {
        const count = this.suggestions().length;
        return `${count} ${count === 1 ? 'suggestion' : 'suggestions'} available.`;
      }
      case 'empty':
        return 'No matching cards.';
      case 'error':
        return 'Suggestions are unavailable.';
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
          this.text.set(value);
          if (value.length < SUGGEST_MIN_CHARS) {
            this.suggestions.set([]);
            this.status.set('idle');
            this.lastQuery.set('');
          }
        }),
        debounceTime(SUGGEST_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((q) => {
          if (q.length < SUGGEST_MIN_CHARS) {
            return EMPTY;
          }
          this.status.set('loading');
          return this.api
            .suggestCards(
              { q, game: this.game() || undefined, limit: SUGGEST_LIMIT },
              'body',
              false,
              {
                context: silentErrors(),
              },
            )
            .pipe(
              tap((items) => {
                const unique = uniqueSuggestions(items ?? []);
                this.suggestions.set(unique);
                this.lastQuery.set(q);
                this.status.set(unique.length ? 'results' : 'empty');
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

  protected readonly displayWith = (value: SearchValue | null): string => {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    return isSeeAll(value) ? value.query : (value.name ?? '');
  };

  protected trackKey(suggestion: CardSuggestion): string {
    return `${suggestion.kind}:${suggestion.id}:${suggestion.printingId ?? ''}`;
  }

  protected gameLabel(slug: string | undefined): string {
    return slug ? gameInfo(slug).shortLabel : '';
  }

  protected onSelected(event: MatAutocompleteSelectedEvent): void {
    const value = event.option.value as CardSuggestion | SeeAllOption;
    if (isSeeAll(value)) {
      this.search(value.query);
      return;
    }
    if (!value.id) {
      return;
    }
    const queryParams =
      value.kind === 'PRINTING' && value.printingId ? { printing: value.printingId } : {};
    // The autocomplete writes the option's label into the field after this event: clear it
    // on the next turn so the box is empty for the next search.
    setTimeout(() => this.reset());
    void this.router.navigate(['/cards', value.id], { queryParams });
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const value = this.query.value;
    const text = typeof value === 'string' ? value.trim() : this.displayWith(value);
    this.search(text);
  }

  protected clear(): void {
    this.reset();
  }

  private search(text: string): void {
    this.trigger()?.closePanel();
    const q = text.trim().slice(0, QUERY_MAX_LENGTH);
    setTimeout(() => this.reset());
    void this.router.navigate(['/cards'], { queryParams: q ? { q } : {} });
  }

  private reset(): void {
    this.query.setValue('');
  }
}
