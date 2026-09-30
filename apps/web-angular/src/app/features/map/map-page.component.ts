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
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import {
  CollectorPreview,
  ConversationSummary,
  ProfileService,
  SearchSuggestion,
} from '@orenji/api-client';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { silentErrors } from '../../core/http/http-context';
import { GamesStore } from '../../shared/catalog/games.store';
import { tagLabel } from '../../shared/discovery/discovery-labels';
import { gameInfo } from '../../shared/domain/games';
import { CityPreset, DEFAULT_TRADING_CENTER } from '../../shared/location/city-presets';
import { MapCircle, MapViewport } from '../../shared/map/map-adapter';
import { ConversationStarterService } from '../../shared/messaging/conversation-starter.service';
import { holdersParams, suggestionPage } from '../../shared/search/suggestions';
import { UnifiedSearchBoxComponent } from '../../shared/search/unified-search-box/unified-search-box.component';
import { AreaPromptComponent } from './area-prompt/area-prompt.component';
import { CollectorPreviewCardComponent } from './collector-preview/collector-preview-card.component';
import { MapDiscoveryStore } from './data/map-discovery.store';
import { buildCollectorMarkers, handleFromMarkerId } from './data/map-markers';
import { MapParams, mapParamsToQuery, parseMapParams } from './data/map-params';
import { DiscoveryPanelComponent } from './discovery-panel/discovery-panel.component';
import { MapCanvasComponent } from './map-canvas/map-canvas.component';
import {
  FilterOption,
  MapFilterChange,
  MapFiltersBarComponent,
} from './map-filters-bar/map-filters-bar.component';
import { MapLegendComponent } from './map-legend/map-legend.component';
import { MessagesPanelComponent } from './messages-panel.component';

/** Design-system `md` breakpoint: the messages panel docks to the side from here. */
const WIDE_QUERY = '(min-width: 960px)';

/**
 * `/map`, the flagship discovery page (Phase 4 contract, "Web /map page"): a full-height map of
 * collectors at their approximate public positions, the unified search (a card or printing
 * switches to "holders of X"), a list alternative, the preview card, the filter bar and the
 * Messages panel (conversations and threads, Phase 5; "Message" in the preview opens the
 * conversation there). Filters live in the URL; the map position never does.
 */
@Component({
  selector: 'app-map-page',
  imports: [
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    AreaPromptComponent,
    CollectorPreviewCardComponent,
    DiscoveryPanelComponent,
    MapCanvasComponent,
    MapFiltersBarComponent,
    MapLegendComponent,
    MessagesPanelComponent,
    UnifiedSearchBoxComponent,
  ],
  providers: [MapDiscoveryStore],
  templateUrl: './map-page.component.html',
  styleUrl: './map-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapPageComponent {
  protected readonly store = inject(MapDiscoveryStore);
  private readonly router = inject(Router);
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly gamesStore = inject(GamesStore);
  private readonly profileApi = inject(ProfileService);
  private readonly starter = inject(ConversationStarterService);

  /** Signed in: the Messages panel shows the collector's conversations. */
  protected readonly signedIn = inject(AuthService).isAuthenticated;
  /** Conversation opened from the preview's Message button (handed to the panel). */
  protected readonly panelConversation = signal<ConversationSummary | null>(null);
  /** A conversation with the previewed collector is being opened. */
  protected readonly messaging = computed(() => {
    const preview = this.store.preview();
    return preview.kind === 'ready' && this.starter.starting() === preview.preview.id;
  });

  // Query parameters (withComponentInputBinding).
  readonly game = input<string | undefined>();
  readonly availability = input<string | undefined>();
  readonly freshness = input<string | undefined>();
  readonly tags = input<string | undefined>();
  readonly radius = input<string | undefined>();
  readonly card = input<string | undefined>();
  readonly printing = input<string | undefined>();
  readonly view = input<string | undefined>();

  protected readonly params = computed<MapParams>(() =>
    parseMapParams({
      game: this.game(),
      availability: this.availability(),
      freshness: this.freshness(),
      tags: this.tags(),
      radius: this.radius(),
      card: this.card(),
      printing: this.printing(),
      view: this.view(),
    }),
  );

  protected readonly fallbackCentre = DEFAULT_TRADING_CENTER;
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

  protected readonly listOpen = computed(() => this.params().view === 'list');
  protected readonly holdersMode = computed(() => this.store.holders() !== null);
  protected readonly holdersQuery = computed<Record<string, string>>(() => {
    const target = this.store.holders();
    return target ? { [target.kind]: target.id } : {};
  });
  protected readonly markerSet = computed(() =>
    buildCollectorMarkers(
      this.store.collectors(),
      this.store.zoom(),
      this.store.selectedHandle(),
      this.store.selfId(),
    ),
  );
  protected readonly circle = computed<MapCircle | null>(() => {
    const result = this.store.result();
    return result
      ? {
          id: 'search-radius',
          center: result.center,
          radiusMeters: this.store.radiusKm() * 1000,
          variant: 'search',
        }
      : null;
  });
  protected readonly showAreaPrompt = computed(() => this.store.origin() === 'city');
  /** Suggestions are ranked around the shown city; own areas are known to the server. */
  protected readonly searchCentre = computed(() =>
    this.store.origin() === 'city' ? this.store.city().center : null,
  );
  protected readonly statusLabel = computed(() => {
    const result = this.store.result();
    if (!result) {
      return this.store.error() ? 'Collectors could not load' : 'Finding collectors…';
    }
    const count = result.total;
    const radius = Math.round(result.radiusKm * 10) / 10;
    if (count === 0) {
      return this.holdersMode()
        ? `Nobody lists this card within ${radius} km yet`
        : `No collectors within ${radius} km yet`;
    }
    const noun = count === 1 ? 'collector' : 'collectors';
    const scope = this.holdersMode() ? `${noun} with this card` : noun;
    return `${count} ${scope} within ${radius} km`;
  });
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly previewIsSelf = computed(() => {
    const preview = this.store.preview();
    return preview.kind === 'ready' && preview.preview.id === this.store.selfId();
  });

  protected readonly gameOptions = computed<FilterOption[]>(() =>
    (this.gamesStore.games() ?? [])
      .filter((game) => !!game.slug)
      .map((game) => ({
        value: game.slug ?? '',
        label: game.name ?? gameInfo(game.slug ?? '').label,
      })),
  );
  private readonly knownTags = signal<ReadonlyMap<string, string>>(new Map());
  private tagsLoaded = false;
  protected readonly tagOptions = computed<FilterOption[]>(() => {
    const labels = this.knownTags();
    const slugs = new Set<string>(labels.keys());
    for (const collector of this.store.collectors()) {
      for (const tag of collector.tags) {
        slugs.add(tag);
      }
    }
    return [...slugs]
      .map((slug) => ({ value: slug, label: tagLabel(slug, labels) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  constructor() {
    effect(() => {
      const params = this.params();
      untracked(() => this.store.setParams(params));
    });
    effect(() => this.panelOpened.set(this.isWide()));
    void this.gamesStore.load();
    void this.store.init();
  }

  /** "Message" in the preview: open (or create) the conversation in the Messages panel. */
  protected async onMessage(preview: CollectorPreview): Promise<void> {
    const conversation = await this.starter.start(preview.id);
    if (!conversation) {
      return;
    }
    this.panelConversation.set(conversation);
    this.panelOpened.set(true);
    if (!this.isWide()) {
      // On phones and tablets the panel covers the map: the preview would sit behind it.
      this.store.select(null);
    }
  }

  protected togglePanel(): void {
    this.panelOpened.update((opened) => !opened);
  }

  protected toggleList(): void {
    this.navigate({ ...this.params(), view: this.listOpen() ? 'map' : 'list' });
  }

  protected closeList(): void {
    this.navigate({ ...this.params(), view: 'map' });
  }

  protected clearHolders(): void {
    this.navigate({ ...this.params(), card: null, printing: null, view: 'map' }, false);
  }

  protected onViewport(viewport: MapViewport): void {
    this.store.viewportChanged(viewport);
  }

  protected onMarker(id: string): void {
    const handle = handleFromMarkerId(id);
    if (handle) {
      this.store.select(handle);
      return;
    }
    const bounds = this.markerSet().clusters.get(id);
    if (bounds) {
      this.store.zoomTo(bounds);
    }
  }

  protected onFilters(change: MapFilterChange): void {
    this.navigate({ ...this.params(), ...change });
  }

  protected onCity(city: CityPreset): void {
    this.store.chooseCity(city);
  }

  /** A choice in the map's search box. */
  protected onPicked(suggestion: SearchSuggestion): void {
    const holders = holdersParams(suggestion);
    if (holders) {
      this.store.select(null);
      this.navigate(
        {
          ...this.params(),
          card: holders['card'] ?? null,
          printing: holders['printing'] ?? null,
          view: 'list',
        },
        false,
      );
      return;
    }
    if (suggestion.type === 'COLLECTOR' && suggestion.slug) {
      this.store.select(suggestion.slug);
      return;
    }
    if (suggestion.type === 'TAG') {
      const slug = suggestion.slug ?? suggestion.id;
      const tags = this.params().tags.includes(slug) ? this.params().tags : [slug];
      this.navigate({ ...this.params(), tags });
      return;
    }
    const page = suggestionPage(suggestion);
    if (page) {
      void this.router.navigate(page);
    }
  }

  protected onSubmitted(text: string): void {
    void this.router.navigate(['/search'], { queryParams: { q: text } });
  }

  private navigate(params: MapParams, replaceUrl = true): void {
    void this.router.navigate(['/map'], {
      queryParams: mapParamsToQuery(params),
      replaceUrl,
    });
  }

  /** Tag labels (`GET /tags`, signed-in only) are loaded the first time the tag list opens. */
  protected onTagsRequested(): void {
    if (this.tagsLoaded || !this.store.signedIn()) {
      return;
    }
    this.tagsLoaded = true;
    this.profileApi
      .searchTags({ limit: 40 }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (tags) =>
          this.knownTags.set(new Map((tags ?? []).map((tag) => [tag.slug, tag.label] as const))),
        error: () => (this.tagsLoaded = false),
      });
  }
}
