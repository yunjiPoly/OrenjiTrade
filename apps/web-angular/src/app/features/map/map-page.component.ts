import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { map } from 'rxjs';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { MAP_FILTERS } from './map-filters';
import { MessagesPanelComponent } from './messages-panel.component';

/** Design-system `md` breakpoint: the messages panel docks to the side from here. */
const WIDE_QUERY = '(min-width: 960px)';

/**
 * Full-height map page: map canvas (placeholder until the MapAdapter lands in Phase 4),
 * collapsible messages side panel and the filter bar.
 */
@Component({
  selector: 'app-map-page',
  imports: [
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
    EmptyStateComponent,
    MessagesPanelComponent,
  ],
  templateUrl: './map-page.component.html',
  styleUrl: './map-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapPageComponent {
  private readonly breakpoints = inject(BreakpointObserver);

  protected readonly filters = MAP_FILTERS;
  protected readonly isWide = toSignal(
    this.breakpoints.observe(WIDE_QUERY).pipe(map((state) => state.matches)),
    { initialValue: this.breakpoints.isMatched(WIDE_QUERY) },
  );
  /** Open by default on wide screens; the user can collapse it. */
  protected readonly panelOpened = signal(this.isWide());
  protected readonly panelMode = computed(() => (this.isWide() ? 'side' : 'over'));
  protected readonly toggleLabel = computed(() =>
    this.panelOpened() ? 'Hide messages panel' : 'Show messages panel',
  );

  constructor() {
    effect(() => this.panelOpened.set(this.isWide()));
  }

  protected togglePanel(): void {
    this.panelOpened.update((opened) => !opened);
  }
}
