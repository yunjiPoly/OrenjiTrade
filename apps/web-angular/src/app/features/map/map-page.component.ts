import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { SearchSuggestion } from '@orenji/api-client';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { RegionContext } from '../../core/region/region-context.service';
import { SponsoredSlotComponent } from '../../shared/ads/sponsored-slot.component';
import { REGION_CODE, RegionsStore, subdivisionLabel } from '../../shared/regions/regions.store';
import { holdersParams, suggestionPage } from '../../shared/search/suggestions';
import { UnifiedSearchBoxComponent } from '../../shared/search/unified-search-box/unified-search-box.component';
import { BoundaryMapComponent } from './boundary-map/boundary-map.component';
import { SHADE_LEGEND, binderCountLabel } from './data/boundaries';
import { RegionMapStore } from './data/region-map.store';
import { MessagesPanelComponent } from './messages-panel.component';
import { SubdivisionListComponent } from './subdivision-list/subdivision-list.component';
import { SubdivisionPanelComponent } from './subdivision-panel/subdivision-panel.component';

/** Design-system `md` breakpoint: the messages panel docks to the side from here. */
const WIDE_QUERY = '(min-width: 960px)';
/** ISO 3166-2 first-level code or a whole-country alpha-2 code. */
const SUBDIVISION_CODE = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

/**
 * `/map?region=&subdivision=` (ADR 0017): the browsed platform region as a map of its states and
 * provinces shaded by public binders, the accessible list of the same places, and the binders of
 * the chosen one (`subdivision`), plus the unified search and the Messages panel. No collector
 * positions exist: the map is drawn from bundled boundary files.
 */
@Component({
  selector: 'app-map-page',
  imports: [
    RouterLink,
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    BoundaryMapComponent,
    MessagesPanelComponent,
    SponsoredSlotComponent,
    SubdivisionListComponent,
    SubdivisionPanelComponent,
    UnifiedSearchBoxComponent,
  ],
  providers: [RegionMapStore],
  templateUrl: './map-page.component.html',
  styleUrl: './map-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapPageComponent {
  protected readonly store = inject(RegionMapStore);
  protected readonly regions = inject(RegionsStore);
  protected readonly context = inject(RegionContext);
  private readonly router = inject(Router);
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly session = inject(SessionService);

  // Query parameters (withComponentInputBinding).
  readonly region = input<string | undefined>();
  readonly subdivision = input<string | undefined>();

  protected readonly legend = SHADE_LEGEND;
  /** Signed in: the Messages panel shows the collector's conversations. */
  protected readonly signedIn = inject(AuthService).isAuthenticated;
  protected readonly isWide = toSignal(
    this.breakpoints.observe(WIDE_QUERY).pipe(map((state) => state.matches)),
    { initialValue: this.breakpoints.isMatched(WIDE_QUERY) },
  );
  protected readonly panelOpened = signal(false);
  protected readonly panelMode = computed(() => (this.isWide() ? 'side' : 'over'));
  /** Unread messages of the signed-in collector (badge on the panel toggle). */
  protected readonly unreadMessages = signal(0);
  protected readonly toggleLabel = computed(() => {
    const label = this.panelOpened() ? 'Hide messages panel' : 'Show messages panel';
    const unread = this.unreadMessages();
    return unread > 0 ? `${label}, ${unread} unread` : label;
  });

  protected readonly regionCode = this.context.current;
  protected readonly regionName = computed(() => this.regions.regionName(this.regionCode()));
  protected readonly platformRegion = computed(() => this.regions.region(this.regionCode()));
  /** Map tooltips and the panel title: "Quebec, Canada" per subdivision code. */
  protected readonly names = computed(() => {
    const names = new Map<string, string>();
    for (const entry of this.regions.subdivisionsOf(this.regionCode())) {
      names.set(entry.subdivision.code, subdivisionLabel(entry));
    }
    return names;
  });
  protected readonly selected = computed(() => this.store.binders()?.code ?? null);
  protected readonly selectedTitle = computed(() => {
    const code = this.selected();
    return code ? (this.names().get(code) ?? code) : '';
  });
  protected readonly selectedSubtitle = computed(() => {
    const code = this.selected();
    return code ? binderCountLabel(this.store.countByCode().get(code)) : '';
  });
  protected readonly statusLabel = computed(() => {
    if (this.store.countsError()) {
      return 'Binder counts could not load';
    }
    if (!this.store.counts()) {
      return 'Counting binders…';
    }
    return `${binderCountLabel(this.store.total())} in ${this.regionName()}`;
  });
  protected readonly countsErrorMessage = computed(() => {
    const error = this.store.countsError();
    return error ? friendlyMessage(error) : '';
  });
  /** Gentle prompt: a signed-in collector who has not said where they are yet. */
  protected readonly promptDismissed = signal(false);
  protected readonly showLocationPrompt = computed(
    () =>
      !this.promptDismissed() &&
      this.session.status() === 'ready' &&
      this.session.me()?.onboarding.locationSet === false,
  );
  protected readonly mapLabel = computed(
    () =>
      `Map of ${this.regionName()}: states and provinces shaded by their number of public binders`,
  );

  /** Last `?region=` applied to the region context (a stale URL never overrides the switcher). */
  private appliedRequest: string | null = null;

  constructor() {
    void this.regions.load();
    effect(() => this.panelOpened.set(this.isWide() && this.signedIn()));
    // The URL's region (a shared link, back/forward) selects the region once; the switcher's
    // choice is then mirrored back into the URL.
    effect(() => {
      const requested = this.region();
      const current = this.context.current();
      untracked(() => {
        if (requested && requested !== this.appliedRequest && REGION_CODE.test(requested)) {
          this.appliedRequest = requested;
          if (requested !== current) {
            this.context.select(requested);
            return;
          }
        }
        this.store.setRegion(current);
        if (requested !== current) {
          this.appliedRequest = current;
          this.navigate(current, null, true);
        }
      });
    });
    effect(() => {
      const code = this.subdivision()?.toUpperCase() ?? null;
      const region = this.store.region();
      untracked(() => {
        if (region && code && SUBDIVISION_CODE.test(code)) {
          this.store.openSubdivision(code);
        } else {
          this.store.closeSubdivision();
        }
      });
    });
  }

  protected openSubdivision(code: string): void {
    this.navigate(this.regionCode(), code, false);
  }

  protected closeSubdivision(): void {
    this.navigate(this.regionCode(), null, false);
  }

  protected togglePanel(): void {
    this.panelOpened.update((opened) => !opened);
  }

  /** A choice in the map's search box. */
  protected onPicked(suggestion: SearchSuggestion): void {
    const holders = holdersParams(suggestion);
    if (holders) {
      void this.router.navigate(['/search'], { queryParams: holders });
      return;
    }
    const page = suggestionPage(suggestion);
    if (page) {
      void this.router.navigate(page);
      return;
    }
    void this.router.navigate(['/search'], {
      queryParams: { q: suggestion.label ?? suggestion.slug ?? '' },
    });
  }

  protected onSubmitted(text: string): void {
    void this.router.navigate(['/search'], { queryParams: { q: text } });
  }

  private navigate(region: string, subdivision: string | null, replaceUrl: boolean): void {
    void this.router.navigate(['/map'], {
      queryParams: { region, subdivision },
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }
}
