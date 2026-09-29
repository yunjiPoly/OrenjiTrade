import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

/** `/collectors/:id` public collector profile (placeholder until Phase 1/3). */
@Component({
  selector: 'app-collector-page',
  imports: [PageHeaderComponent, EmptyStateComponent],
  template: `
    <div class="page">
      <app-page-header title="Collector" [subtitle]="subtitle()" />
      <app-empty-state
        icon="person_search"
        title="Collector profiles arrive in Phase 1"
        description="Public profiles show display name, games, tags, ratings and public binders at an approximate location."
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectorPageComponent {
  /** Bound from the `:id` route parameter. */
  readonly id = input.required<string>();
  protected readonly subtitle = computed(() => `Profile ${this.id()}`);
}
