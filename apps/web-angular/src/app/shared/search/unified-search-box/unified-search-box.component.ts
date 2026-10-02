import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
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
import { SearchService, SearchSuggestion } from '@orenji/api-client';
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
import {
  QUERY_MAX_LENGTH,
  SUGGEST_DEBOUNCE_MS,
  SUGGEST_MIN_CHARS,
} from '../../catalog/catalog-constants';
import { avatarColor } from '../../discovery/discovery-labels';
import { initialsOf, roundCoordinate } from '../../domain/location-labels';
import type { LatLng } from '../../map/map-adapter';
import { CardImageComponent } from '../../ui/card-image/card-image.component';
import {
  SuggestionGroup,
  groupSuggestions,
  suggestionIcon,
  suggestionKindLabel,
} from '../suggestions';

type SearchValue = string | SearchSuggestion;
type Status = 'idle' | 'loading' | 'results' | 'empty' | 'error';

/** Entries requested per keystroke (the API interleaves one per kind). */
const LIMIT = 10;

/**
 * Unified search with mixed autocomplete (`GET /search/suggest`): cards, printings, sets,
 * collectors, public binders and tags, grouped by kind. The parent decides what a choice does
 * (`picked`) and what Enter without a highlighted entry does (`submitted`), so the map and the
 * search page can reuse it. Suggestions are ranked around `centre` when given (otherwise around
 * the signed-in collector's trading area on the server).
 */
@Component({
  selector: 'app-unified-search-box',
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    CardImageComponent,
  ],
  template: `
    <form class="usb" role="search" [attr.aria-label]="label()" (submit)="submit($event)">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="usb__field">
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
          <span matSuffix class="usb__spinner" aria-hidden="true"></span>
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
      class="csb-panel usb-panel"
      [displayWith]="displayWith"
      (optionSelected)="onSelected($event)"
    >
      @for (group of groups(); track group.id) {
        <mat-optgroup [label]="group.label">
          @for (item of group.items; track item.type + ':' + item.id) {
            <mat-option [value]="item" class="csb-option">
              <span class="csb-option__row">
                @if (item.type === 'CARD' || item.type === 'PRINTING') {
                  <app-card-image
                    class="csb-option__img"
                    size="xs"
                    [src]="item.imageUrl"
                    [game]="item.game"
                    alt=""
                  />
                } @else if (item.type === 'COLLECTOR') {
                  <span class="usb-option__avatar" [style.background]="color(item.label)">
                    {{ initials(item.label) }}
                  </span>
                } @else {
                  <span class="usb-option__icon" aria-hidden="true">
                    <mat-icon>{{ icon(item.type) }}</mat-icon>
                  </span>
                }
                <span class="csb-option__text">
                  <span class="csb-option__name">{{ item.label }}</span>
                  @if (item.sublabel) {
                    <span class="csb-option__meta">{{ item.sublabel }}</span>
                  }
                </span>
                <span class="csb-option__kind">{{ kind(item.type) }}</span>
              </span>
            </mat-option>
          }
        </mat-optgroup>
      }
      @if (status() === 'empty') {
        <mat-option disabled class="csb-option--info"
          >Nothing matches “{{ lastQuery() }}”.</mat-option
        >
      }
      @if (status() === 'error') {
        <mat-option disabled class="csb-option--info">
          Suggestions are unavailable. Press Enter to search.
        </mat-option>
      }
    </mat-autocomplete>
  `,
  styles: `
    :host {
      display: block;
    }
    .usb__field {
      width: 100%;
    }
    .usb__spinner {
      display: inline-block;
      width: 18px;
      height: 18px;
      margin: 0 var(--spacing-3);
      border: 2px solid var(--color-border);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: usb-spin 0.8s linear infinite;
    }
    @keyframes usb-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnifiedSearchBoxComponent {
  private readonly api = inject(SearchService);
  private readonly trigger = viewChild(MatAutocompleteTrigger);

  readonly label = input('Search cards, collectors, binders and tags');
  readonly placeholder = input('Search cards, collectors, binders, tags');
  /** Centre used to rank nearby collectors (rounded; `null` = the caller's trading area). */
  readonly centre = input<LatLng | null>(null);
  /** Text shown in the field (e.g. the current `q`). */
  readonly value = input('');
  /** Keep the chosen entry's label in the field (search page) or clear it (map). */
  readonly keepSelection = input(false);

  readonly picked = output<SearchSuggestion>();
  readonly submitted = output<string>();

  protected readonly maxLength = QUERY_MAX_LENGTH;
  protected readonly query = new FormControl<SearchValue>('', { nonNullable: true });
  protected readonly suggestions = signal<SearchSuggestion[]>([]);
  protected readonly groups = computed<SuggestionGroup[]>(() =>
    groupSuggestions(this.suggestions()),
  );
  protected readonly status = signal<Status>('idle');
  protected readonly lastQuery = signal('');
  protected readonly text = signal('');
  protected readonly hasText = computed(() => this.text().length > 0);
  protected readonly announcement = computed(() => {
    switch (this.status()) {
      case 'results': {
        const count = this.suggestions().length;
        return `${count} ${count === 1 ? 'suggestion' : 'suggestions'} available.`;
      }
      case 'empty':
        return 'No suggestions.';
      case 'error':
        return 'Suggestions are unavailable.';
      default:
        return '';
    }
  });

  constructor() {
    effect(() => {
      const value = this.value();
      untracked(() => {
        if (typeof this.query.value !== 'string' || this.query.value !== value) {
          this.query.setValue(value, { emitEvent: false });
          this.text.set(value.trim());
        }
      });
    });

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
          const centre = this.centre();
          return this.api
            .suggestSearch(
              {
                q,
                limit: LIMIT,
                lat: centre ? roundCoordinate(centre.lat) : undefined,
                lng: centre ? roundCoordinate(centre.lng) : undefined,
              },
              'body',
              false,
              { context: silentErrors() },
            )
            .pipe(
              tap((items) => {
                this.suggestions.set(items ?? []);
                this.lastQuery.set(q);
                this.status.set(items?.length ? 'results' : 'empty');
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

  protected readonly displayWith = (value: SearchValue | null): string =>
    !value ? '' : typeof value === 'string' ? value : value.label;

  protected icon(type: string): string {
    return suggestionIcon(type);
  }

  protected kind(type: string): string {
    return suggestionKindLabel(type);
  }

  protected initials(name: string): string {
    return initialsOf(name);
  }

  protected color(name: string): string {
    return avatarColor(name);
  }

  protected onSelected(event: MatAutocompleteSelectedEvent): void {
    const value = event.option.value as SearchSuggestion;
    if (!this.keepSelection()) {
      // The autocomplete writes the label into the field after this event: clear it next turn.
      setTimeout(() => this.reset());
    }
    this.picked.emit(value);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const value = this.query.value;
    const text = (typeof value === 'string' ? value : value.label).trim();
    this.trigger()?.closePanel();
    if (text) {
      this.submitted.emit(text.slice(0, QUERY_MAX_LENGTH));
    }
  }

  protected clear(): void {
    this.reset();
  }

  private reset(): void {
    this.query.setValue('');
  }
}
