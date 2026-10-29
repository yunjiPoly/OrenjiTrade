import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SearchSuggestion } from '@orenji/api-client';
import { SessionService } from '../../core/auth/session.service';
import { ShellLayout } from '../../core/layout/shell-layout.service';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { RegionContext } from '../../core/region/region-context.service';
import { REGION_CODE, RegionsStore, subdivisionLabel } from '../../shared/regions/regions.store';
import { holdersParams, suggestionPage } from '../../shared/search/suggestions';
import { UnifiedSearchBoxComponent } from '../../shared/search/unified-search-box/unified-search-box.component';
import { BoundaryMapComponent } from './boundary-map/boundary-map.component';
import { SHADE_LEGEND, binderCountLabel } from './data/boundaries';
import { RegionMapStore } from './data/region-map.store';
import { SubdivisionListComponent } from './subdivision-list/subdivision-list.component';
import { SubdivisionPanelComponent } from './subdivision-panel/subdivision-panel.component';

/** The id of the list after the map: "Skip the map" jumps there (spec 4.1). */
export const MAP_LIST_ID = 'map-list';
/** ISO 3166-2 first-level code or a whole-country alpha-2 code. */
const SUBDIVISION_CODE = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

/**
 * The browsed platform region as a map of its states and provinces shaded by public binders
 * (ADR 0017), the accessible list of the same places, and the binders of the chosen one
 * (`?state=`), plus the unified search. No collector positions exist: the map is drawn from
 * bundled boundary files. Until web stages WD and WE rebuild them, it is Home (`/?region&state`)
 * and Search › Binders without a text (`/search?tab=binders&region&state`, `embedded`); old
 * `/map` links redirect there. The side Messages panel left with the new shell (spec 2.7): Messages
 * is one rail item away.
 */
@Component({
  selector: 'app-map-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    BoundaryMapComponent,
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
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);

  // Query parameters (withComponentInputBinding on Home; passed by Search when embedded).
  readonly region = input<string | undefined>();
  readonly state = input<string | undefined>();
  /** Inside Search › Binders: its title is a section of the Search page (h2, not h1). */
  readonly embedded = input(false, { transform: booleanAttribute });

  protected readonly legend = SHADE_LEGEND;
  protected readonly listId = MAP_LIST_ID;

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
    const layout = inject(ShellLayout);
    layout.setSkipMapTarget(MAP_LIST_ID);
    inject(DestroyRef).onDestroy(() => layout.setSkipMapTarget(null));
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
      const code = this.state()?.toUpperCase() ?? null;
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

  private navigate(region: string, state: string | null, replaceUrl: boolean): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { region, state },
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }
}
