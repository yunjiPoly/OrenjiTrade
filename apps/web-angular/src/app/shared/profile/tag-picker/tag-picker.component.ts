import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  booleanAttribute,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ProfileService, TagResponse } from '@orenji/api-client';
import {
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import { ErrorStateComponent } from '../../ui/error-state/error-state.component';
import { SkeletonComponent } from '../../ui/skeleton/skeleton.component';

/** API limits for profile tags (`PUT /me/profile/tags`). */
export const MAX_PROFILE_TAGS = 12;
export const CUSTOM_TAG_MIN = 2;
export const CUSTOM_TAG_MAX = 24;

interface SearchResult {
  loading: boolean;
  tags: TagResponse[];
  error: ApiError | null;
}

/**
 * Tag chips with search (`GET /tags`): pick curated tags or add custom labels (2–24 characters),
 * up to 12 in total. The parent persists the selection.
 */
@Component({
  selector: 'app-tag-picker',
  imports: [
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './tag-picker.component.html',
  styleUrl: './tag-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagPickerComponent {
  private readonly profileApi = inject(ProfileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly selected = model<TagResponse[]>([]);
  readonly customLabels = model<string[]>([]);
  readonly disabled = input(false, { transform: booleanAttribute });

  protected readonly max = MAX_PROFILE_TAGS;
  protected readonly query = signal('');
  protected readonly result = signal<SearchResult>({ loading: true, tags: [], error: null });
  protected readonly count = computed(() => this.selected().length + this.customLabels().length);
  protected readonly full = computed(() => this.count() >= MAX_PROFILE_TAGS);
  protected readonly suggestions = computed(() => {
    const chosen = new Set(this.selected().map((tag) => tag.id));
    return this.result().tags.filter((tag) => !chosen.has(tag.id));
  });
  /** A trimmed query that can become a custom tag (length ok, not already present). */
  protected readonly customCandidate = computed(() => {
    const label = this.query().trim().replace(/\s+/g, ' ');
    if (label.length < CUSTOM_TAG_MIN || label.length > CUSTOM_TAG_MAX) {
      return null;
    }
    const lower = label.toLowerCase();
    const exists =
      this.result().tags.some((tag) => tag.label.toLowerCase() === lower) ||
      this.selected().some((tag) => tag.label.toLowerCase() === lower) ||
      this.customLabels().some((custom) => custom.toLowerCase() === lower);
    return exists ? null : label;
  });

  private readonly searches = new Subject<{ query: string; nonce: number }>();
  private nonce = 0;

  constructor() {
    this.searches
      .pipe(
        startWith({ query: '', nonce: 0 }),
        map((search) => ({ ...search, query: search.query.trim() })),
        debounceTime(250),
        distinctUntilChanged((a, b) => a.query === b.query && a.nonce === b.nonce),
        switchMap(({ query }) => {
          this.result.update((state) => ({ ...state, loading: true, error: null }));
          return this.profileApi
            .searchTags({ query: query || undefined, limit: 24 }, 'body', false, {
              context: silentErrors(),
            })
            .pipe(
              map((tags): SearchResult => ({ loading: false, tags, error: null })),
              catchError((error: unknown) =>
                of<SearchResult>({ loading: false, tags: [], error: toApiError(error) }),
              ),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => this.result.set(result));
  }

  protected onQuery(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.searches.next({ query: value, nonce: this.nonce });
  }

  protected retry(): void {
    this.searches.next({ query: this.query(), nonce: ++this.nonce });
  }

  protected onEnter(event: Event): void {
    event.preventDefault();
    const lower = this.query().trim().toLowerCase();
    const exact = this.suggestions().find((tag) => tag.label.toLowerCase() === lower);
    if (exact) {
      this.add(exact);
    } else if (this.customCandidate()) {
      this.addCustom();
    }
  }

  protected add(tag: TagResponse): void {
    if (this.full() || this.disabled()) {
      return;
    }
    this.selected.update((current) => [...current, tag]);
  }

  protected remove(tag: TagResponse): void {
    this.selected.update((current) => current.filter((t) => t.id !== tag.id));
  }

  protected addCustom(): void {
    const label = this.customCandidate();
    if (!label || this.full() || this.disabled()) {
      return;
    }
    this.customLabels.update((current) => [...current, label]);
    this.query.set('');
    this.searches.next({ query: '', nonce: this.nonce });
  }

  protected removeCustom(label: string): void {
    this.customLabels.update((current) => current.filter((l) => l !== label));
  }
}
