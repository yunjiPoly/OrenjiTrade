import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { CardDetail, CatalogService, PrintingSummary } from '@orenji/api-client';
import { Subscription, filter } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { APP_NAME } from '../../../core/routing/orenji-title.strategy';
import { CardImageComponent } from '../../../shared/catalog/card-image/card-image.component';
import {
  editionLabel,
  finishLabel,
  formatMarketPrice,
  languageLabel,
} from '../../../shared/catalog/catalog-labels';
import { GamesStore } from '../../../shared/catalog/games.store';
import { gameInfo } from '../../../shared/domain/games';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { GameChipComponent } from '../../../shared/ui/game-chip/game-chip.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { PrintingsTableComponent } from '../shared/printings-table.component';
import { CardMetadataComponent } from './card-metadata.component';

/**
 * `/cards/:id` (`?printing=` selects a printing): hero picture, game-specific attributes from the
 * game's schema, the selected printing with its market price, every printing, "Who has this near
 * me" (the map in holders mode) and "Add to wishlist" (coming soon, Phase 6).
 */
@Component({
  selector: 'app-card-detail-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    CardImageComponent,
    CardMetadataComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    GameChipComponent,
    PrintingsTableComponent,
    SkeletonComponent,
  ],
  templateUrl: './card-detail-page.component.html',
  styleUrl: './card-detail-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardDetailPageComponent {
  private readonly api = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly games = inject(GamesStore);

  /** Route parameter and `?printing=` query parameter (bound by the router). */
  readonly id = input.required<string>();
  readonly printing = input<string | undefined>();

  protected readonly card = signal<CardDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  /** Unknown card, hidden game, or an id that is not a UUID (400 from the API). */
  protected readonly notFound = computed(() => {
    const error = this.error();
    return !!error && (error.status === 404 || error.errorCode === 'VALIDATION_FAILED');
  });
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });

  protected readonly printings = computed<PrintingSummary[]>(() => this.card()?.printings ?? []);
  protected readonly selected = computed<PrintingSummary | null>(() => {
    const printings = this.printings();
    const wanted = this.printing();
    return printings.find((candidate) => candidate.id === wanted) ?? printings[0] ?? null;
  });
  protected readonly schema = computed(() => this.games.schema(this.card()?.game));
  protected readonly gameLabel = computed(() => gameInfo(this.card()?.game ?? '').label);
  protected readonly typeLine = computed(() => {
    const card = this.card();
    return [card?.cardType, card?.subtype].filter(Boolean).join(' · ');
  });
  protected readonly heroImage = computed(() => {
    const front = this.selected()?.images?.find((image) => image.kind === 'FRONT')?.url;
    return front ?? this.card()?.primaryImageUrl ?? null;
  });
  protected readonly heroAlt = computed(() => {
    const card = this.card();
    const code = this.selected()?.printingCode;
    return card ? `${card.name}${code ? `, printing ${code}` : ''}` : '';
  });
  protected readonly selectedPrice = computed(() =>
    formatMarketPrice(this.selected()?.marketPrice),
  );
  protected readonly edition = editionLabel;
  protected readonly finish = finishLabel;
  protected readonly language = languageLabel;

  private subscription: Subscription | null = null;

  constructor() {
    void this.games.load();
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
    // The title strategy resets the document title on every navigation (including `?printing=`
    // changes): re-apply the card name afterwards.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => setTimeout(() => this.applyTitle()));
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected reload(): void {
    this.load(this.id());
  }

  protected selectPrinting(printingId: string): void {
    void this.router.navigate([], {
      queryParams: { printing: printingId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private load(id: string): void {
    this.subscription?.unsubscribe();
    if (this.card()?.id !== id) {
      this.card.set(null);
    }
    this.loading.set(true);
    this.error.set(null);
    this.subscription = this.api
      .getCard({ id }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (card) => {
          this.card.set(card);
          this.loading.set(false);
          this.applyTitle();
        },
        error: (error: unknown) => {
          this.card.set(null);
          this.error.set(toApiError(error));
          this.loading.set(false);
        },
      });
  }

  private applyTitle(): void {
    const name = this.card()?.name;
    if (name) {
      this.title.setTitle(`${name} · ${APP_NAME}`);
    }
  }
}
