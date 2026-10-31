import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminReportsService, AdminUsersService, CatalogService } from '@orenji/api-client';
import { Observable, Subscription, catchError, forkJoin, map, of, timer, switchMap } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { silentErrors } from '../../../core/http/http-context';
import { GLOBAL_SEARCH_ID } from '../../../core/keyboard/keyboard-shortcuts.service';
import { reportReasonLabel } from '../../../shared/reports/report-labels';
import { AdminIconComponent } from './admin-icon.component';
import {
  STAFF_SEARCH_GROUPS,
  StaffGroupAnswer,
  StaffSearchResult,
  asksCards,
  orderedResults,
  parseStaffQuery,
  reportNumberLabel,
  staffQueryReady,
  staffSearchFailed,
} from './staff-search';

const DEBOUNCE_MS = 250;

/**
 * The console's staff search (spec 15.1): "Find a collector, card or report" for administrators
 * (a handle, an email or a name; a card name; a report number), "Find a report by its number" for
 * moderators. `/` focuses it (it carries the top bar's search id). Results drop down grouped
 * Collectors, Cards and Reports; the arrows move, Enter opens the active one or the first, Esc
 * closes. Until stage WH2's one endpoint, it asks the existing lists: accounts, the catalog and
 * the report queue by number.
 */
@Component({
  selector: 'app-staff-search',
  imports: [RouterLink, AdminIconComponent],
  template: `
    <div class="ss" [class.ss--open]="open()">
      <app-admin-icon name="search" [size]="18" class="ss__icon" />
      <input
        class="ss__input"
        type="search"
        role="combobox"
        autocomplete="off"
        [id]="inputId"
        [attr.aria-label]="placeholder()"
        [placeholder]="placeholder()"
        aria-autocomplete="list"
        [attr.aria-expanded]="open()"
        aria-controls="staff-search-list"
        [attr.aria-activedescendant]="activeId()"
        [value]="text()"
        (input)="onInput($event)"
        (keydown)="onKey($event)"
        (focus)="focused.set(true)"
        (blur)="onBlur()"
        data-testid="staff-search"
      />
      <kbd class="ss__key" aria-hidden="true">/</kbd>
      @if (open()) {
        <div
          class="ss__panel"
          id="staff-search-list"
          role="listbox"
          [attr.aria-label]="placeholder()"
        >
          @if (searching() && results().length === 0) {
            <p class="ss__note" role="presentation">Searching…</p>
          } @else if (failed()) {
            <p class="ss__note ss__note--error" role="presentation">
              Search failed.
              <button
                type="button"
                class="ss__retry"
                (mousedown)="$event.preventDefault()"
                (click)="retry()"
              >
                Try again
              </button>
            </p>
          } @else if (results().length === 0) {
            <p class="ss__note" role="presentation">{{ emptyLine() }}</p>
          } @else {
            @for (group of groups(); track group.id) {
              <div class="ss__group" role="group" [attr.aria-labelledby]="'ss-group-' + group.id">
                <p class="ss__group-label" [id]="'ss-group-' + group.id" role="presentation">
                  {{ group.label }}
                </p>
                @for (result of group.results; track result.id) {
                  <a
                    class="ss__option"
                    role="option"
                    tabindex="-1"
                    [id]="'ss-' + result.group + '-' + result.id"
                    [attr.aria-selected]="activeId() === 'ss-' + result.group + '-' + result.id"
                    [routerLink]="result.link"
                    (mousedown)="$event.preventDefault()"
                    (click)="clear()"
                  >
                    <span class="ss__title">{{ result.title }}</span>
                    <span class="ss__line">{{ result.line }}</span>
                  </a>
                }
              </div>
            }
          }
        </div>
      }
      <span class="visually-hidden" aria-live="polite">{{ announcement() }}</span>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .ss {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      height: 40px;
      padding: 0 8px 0 14px;
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-text-muted);
    }
    .ss:focus-within {
      border-color: var(--color-border-strong);
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 1px;
    }
    .ss__input {
      flex: 1 1 auto;
      min-width: 0;
      border: 0;
      outline: none;
      background: none;
      color: var(--color-ink);
      font: inherit;
      font-size: var(--font-size-sm);
    }
    .ss__input::placeholder {
      color: var(--color-text-muted);
    }
    .ss__key {
      display: inline-grid;
      place-items: center;
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-sm);
      color: var(--color-text-secondary);
      font: inherit;
      font-size: var(--font-size-xs);
    }
    .ss__panel {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      left: 0;
      z-index: 40;
      max-height: min(480px, 70vh);
      overflow-y: auto;
      padding: 6px;
      border: 1px solid var(--color-border-strong);
      border-radius: 14px;
      background: var(--color-surface-elevated);
      box-shadow: var(--elevation-menu);
    }
    .ss__group + .ss__group {
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px solid var(--color-border);
    }
    .ss__group-label {
      margin: 6px 10px 4px;
      color: var(--color-text-secondary);
      font-size: 11px;
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .ss__option {
      display: flex;
      color: inherit;
      text-decoration: none;
      flex-direction: column;
      gap: 2px;
      padding: 8px 10px;
      border-radius: 10px;
      cursor: pointer;
    }
    .ss__option:hover,
    .ss__option[aria-selected='true'] {
      background: var(--color-primary-tint);
    }
    .ss__title {
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .ss__line {
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }
    .ss__note {
      margin: 8px 10px;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .ss__note--error {
      color: var(--color-danger);
    }
    .ss__retry {
      min-height: 24px;
      margin-left: 6px;
      padding: 0 6px;
      border: 0;
      border-radius: 6px;
      background: none;
      color: var(--color-accent);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      text-decoration: underline;
      cursor: pointer;
    }
    .ss__retry:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffSearchComponent {
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly reportsApi = inject(AdminReportsService);
  private readonly usersApi = inject(AdminUsersService);
  private readonly catalogApi = inject(CatalogService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly inputId = GLOBAL_SEARCH_ID;
  protected readonly text = signal('');
  protected readonly focused = signal(false);
  protected readonly searching = signal(false);
  protected readonly results = signal<StaffSearchResult[]>([]);
  /** Every asked group failed and nothing came back (review fix 1): an error, not "no match". */
  protected readonly failed = signal(false);
  private readonly activeIndex = signal(-1);
  private readonly asked = signal(false);
  private subscription: Subscription | null = null;

  protected readonly admin = computed(() => this.session.isAdmin());
  protected readonly placeholder = computed(() =>
    this.admin() ? 'Find a collector, card or report' : 'Find a report by its number',
  );
  protected readonly open = computed(
    () => this.focused() && this.asked() && this.text().trim().length > 0,
  );
  protected readonly groups = computed(() =>
    STAFF_SEARCH_GROUPS.map((group) => ({
      ...group,
      results: this.results().filter((result) => result.group === group.id),
    })).filter((group) => group.results.length > 0),
  );
  protected readonly activeId = computed(() => {
    const result = this.results()[this.activeIndex()];
    return this.open() && result ? `ss-${result.group}-${result.id}` : null;
  });
  protected readonly emptyLine = computed(() =>
    this.admin()
      ? 'Nothing matches. Try a handle, an email, a card name or a report number.'
      : 'No report has this number.',
  );
  protected readonly announcement = computed(() => {
    if (!this.open() || this.searching()) {
      return '';
    }
    if (this.failed()) {
      return 'Search failed. Try again.';
    }
    const count = this.results().length;
    return count === 0 ? this.emptyLine() : `${count} ${count === 1 ? 'result' : 'results'}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.text.set(value);
    this.search(value);
  }

  protected onBlur(): void {
    // A click on an option keeps the focus (mousedown prevented); Tab away closes the list.
    setTimeout(() => {
      if (!this.host.nativeElement.contains(this.host.nativeElement.ownerDocument.activeElement)) {
        this.focused.set(false);
      }
    });
  }

  protected onKey(event: KeyboardEvent): void {
    const results = this.results();
    switch (event.key) {
      case 'ArrowDown':
        if (results.length) {
          event.preventDefault();
          this.activeIndex.set((this.activeIndex() + 1) % results.length);
        }
        break;
      case 'ArrowUp':
        if (results.length) {
          event.preventDefault();
          this.activeIndex.set(
            this.activeIndex() <= 0 ? results.length - 1 : this.activeIndex() - 1,
          );
        }
        break;
      case 'Enter': {
        const result = results[Math.max(0, this.activeIndex())];
        if (result) {
          event.preventDefault();
          this.go(result);
        }
        break;
      }
      case 'Escape':
        if (this.text()) {
          event.preventDefault();
          event.stopPropagation();
          this.clear();
        } else {
          (event.target as HTMLInputElement).blur();
        }
        break;
    }
  }

  protected go(result: StaffSearchResult): void {
    this.clear();
    void this.router.navigate(result.link);
  }

  /** "Try again" after a failed search: the same text once more. */
  protected retry(): void {
    this.search(this.text());
  }

  protected clear(): void {
    this.subscription?.unsubscribe();
    this.text.set('');
    this.failed.set(false);
    this.results.set([]);
    this.asked.set(false);
    this.searching.set(false);
    this.activeIndex.set(-1);
  }

  private search(raw: string): void {
    this.subscription?.unsubscribe();
    this.failed.set(false);
    const query = parseStaffQuery(raw);
    const admin = this.admin();
    if (!staffQueryReady(query, admin)) {
      this.results.set([]);
      this.asked.set(query.text.length > 0);
      this.searching.set(false);
      this.activeIndex.set(-1);
      return;
    }
    this.asked.set(true);
    this.searching.set(true);
    const options = { context: silentErrors() };
    const none: Observable<StaffGroupAnswer> = of({ results: [], failed: false });
    const answer = (request: Observable<StaffSearchResult[]>): Observable<StaffGroupAnswer> =>
      request.pipe(
        map((results) => ({ results, failed: false })),
        catchError(() => of({ results: [] as StaffSearchResult[], failed: true })),
      );
    const reports = query.number
      ? answer(
          this.reportsApi
            .listReports({ number: query.number, size: 5 }, 'body', false, options)
            .pipe(
              map((page) =>
                (page.items ?? []).map((report): StaffSearchResult => ({
                  id: report.id,
                  group: 'reports',
                  title: `${reportNumberLabel(report.number)} · @${report.reportedUser.handle}`,
                  line: reportReasonLabel(report.reason),
                  link: ['/admin/reports', report.id],
                })),
              ),
            ),
        )
      : none;
    const text = query.text.replace(/^#/, '');
    const collectors =
      admin && query.number === null
        ? answer(
            this.usersApi.listUsers({ query: text, size: 5 }, 'body', false, options).pipe(
              map((page) =>
                (page.items ?? []).map((user): StaffSearchResult => ({
                  id: user.id,
                  group: 'collectors',
                  title: user.displayName || `@${user.handle}`,
                  line: `@${user.handle}`,
                  link: ['/admin/users', user.id],
                })),
              ),
            ),
          )
        : none;
    const cards =
      admin && query.number === null && asksCards(text)
        ? answer(
            this.catalogApi.searchCards({ query: text, size: 5 }, 'body', false, options).pipe(
              map((page) =>
                (page.items ?? [])
                  .filter((card) => !!card.id)
                  .map((card): StaffSearchResult => ({
                    id: card.id as string,
                    group: 'cards',
                    title: card.name ?? '',
                    line: card.cardType ?? '',
                    link: ['/admin/cards', card.id as string],
                  })),
              ),
            ),
          )
        : none;
    this.subscription = timer(DEBOUNCE_MS)
      .pipe(switchMap(() => forkJoin([collectors, cards, reports])))
      .subscribe((answers) => {
        this.failed.set(staffSearchFailed(answers));
        this.results.set(orderedResults(answers.flatMap((group) => group.results)));
        this.activeIndex.set(-1);
        this.searching.set(false);
      });
  }
}
