import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { SearchService, UnifiedSearchResponse } from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { CardGridComponent } from '../../../shared/catalog/card-grid/card-grid.component';
import { cardPicturesOfResults } from '../../../shared/catalog/card-pictures';
import {
  DiscoveryCentre,
  DiscoveryCentreService,
} from '../../../shared/discovery/discovery-centre';
import { distanceBucketLabel } from '../../../shared/domain/location-labels';
import { PublicBinderCardComponent } from '../../../shared/inventory/public-binder-card/public-binder-card.component';
import { printingCode, printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { SEARCH_TABS, SearchTab } from '../data/search-params';
import { CollectorResultComponent } from './collector-result.component';

/** Results per section of `GET /search`. */
const SECTION_LIMIT = 12;

/**
 * Unified search results (`GET /search`) in tabs: cards (with printings and sets), collectors and
 * public binders. When the query designates a card or printing, a banner lists the collectors near
 * you who hold it and leads to the full holders view and the map.
 */
@Component({
  selector: 'app-unified-results',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    AvatarComponent,
    CardGridComponent,
    CardImageComponent,
    CollectorResultComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PublicBinderCardComponent,
    SkeletonComponent,
  ],
  templateUrl: './unified-results.component.html',
  styleUrl: './unified-results.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnifiedResultsComponent {
  private readonly api = inject(SearchService);
  private readonly centres = inject(DiscoveryCentreService);

  readonly q = input.required<string>();
  readonly tab = input<SearchTab>('cards');
  readonly tabChange = output<SearchTab>();

  protected readonly result = signal<UnifiedSearchResponse | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly centre = signal<DiscoveryCentre | null>(null);
  protected readonly tabIndex = computed(() => Math.max(0, SEARCH_TABS.indexOf(this.tab())));
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly cardCount = computed(() => {
    const result = this.result();
    return result ? result.cards.length + result.printings.length + result.sets.length : 0;
  });
  protected readonly empty = computed(() => {
    const result = this.result();
    return (
      !!result &&
      this.cardCount() === 0 &&
      result.collectors.length === 0 &&
      result.binders.length === 0
    );
  });
  /** The card the query resolved to (for the holders banner). */
  protected readonly resolved = computed(() => {
    const result = this.result();
    const printingId = result?.resolved.printingId ?? null;
    const cardId = result?.resolved.cardId ?? null;
    if (!result || (!printingId && !cardId)) {
      return null;
    }
    const printing = printingId ? result.printings.find((p) => p.id === printingId) : undefined;
    const card = result.cards.find((c) => c.id === (cardId ?? printing?.cardId));
    const name = card?.name ?? result.collectors[0]?.matchingItems[0]?.cardName ?? result.query;
    const code = printing ? printingCode(printing) : '';
    return {
      name: code ? `${name} (${code})` : name,
      query: printingId ? { printing: printingId } : { card: cardId as string },
      holders: result.collectors.filter((collector) => collector.matchingItems.length > 0),
      pictures: cardPicturesOfResults(card, result.printings, printingId),
    };
  });
  protected readonly mapQuery = computed(() => ({
    ...(this.resolved()?.query ?? {}),
    view: 'list',
  }));

  private subscription: Subscription | null = null;

  constructor() {
    effect(() => {
      const q = this.q();
      untracked(() => void this.load(q));
    });
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected async load(q: string): Promise<void> {
    this.subscription?.unsubscribe();
    this.result.set(null);
    this.error.set(null);
    const centre = this.centre() ?? (await this.centres.resolve());
    this.centre.set(centre);
    const city = centre.city?.center ?? null;
    this.subscription = this.api
      .search(
        {
          q,
          limit: SECTION_LIMIT,
          lat: city ? city.lat : undefined,
          lng: city ? city.lng : undefined,
        },
        'body',
        false,
        { context: silentErrors() },
      )
      .subscribe({
        next: (result) => this.result.set(result),
        error: (error: unknown) => this.error.set(toApiError(error)),
      });
  }

  protected onTab(index: number): void {
    const tab = SEARCH_TABS[index] ?? 'cards';
    if (tab !== this.tab()) {
      this.tabChange.emit(tab);
    }
  }

  protected distance(bucket: string | null | undefined): string | null {
    return this.centre()?.signedIn ? distanceBucketLabel(bucket) : null;
  }

  protected image(printing: Parameters<typeof printingImageUrl>[0]): string | null {
    return printingImageUrl(printing);
  }

  protected code(printing: Parameters<typeof printingCode>[0]): string {
    return printingCode(printing);
  }
}
