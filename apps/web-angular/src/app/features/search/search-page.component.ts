import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { SearchFieldComponent } from '../../shared/ui/search-field/search-field.component';

/** `/search?q=...` — unified search lands in Phase 4; the page already owns the query state. */
@Component({
  selector: 'app-search-page',
  imports: [PageHeaderComponent, SearchFieldComponent, EmptyStateComponent],
  template: `
    <div class="page">
      <app-page-header title="Search" subtitle="Cards, sets, collectors and public binders near you.">
        <app-search-field class="search__field" [initialQuery]="query()" (search)="onSearch($event)" />
      </app-page-header>

      @if (query()) {
        <p class="search__summary" aria-live="polite">
          Results for <strong>“{{ query() }}”</strong>
        </p>
        <app-empty-state
          icon="search_off"
          title="No results yet"
          description="Unified search (cards, printings, sets, collectors, public binders) arrives in Phase 4."
        />
      } @else {
        <app-empty-state
          icon="search"
          title="Search for a card, set or collector"
          description="Type a card name above. Results will show who near you owns, trades or sells it."
        />
      }
    </div>
  `,
  styles: `
    .search__field {
      max-width: 640px;
    }
    .search__summary {
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPageComponent {
  private readonly router = inject(Router);

  /** Bound from the `q` query parameter (withComponentInputBinding). */
  readonly q = input<string | undefined>();
  protected readonly query = computed(() => this.q()?.trim() ?? '');

  protected onSearch(query: string): void {
    void this.router.navigate(['/search'], { queryParams: { q: query } });
  }
}
