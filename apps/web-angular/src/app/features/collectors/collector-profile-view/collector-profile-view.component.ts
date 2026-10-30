import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import type {
  CollectorProfileResponse,
  CollectorRating,
  PublicBinderSummary,
  PublicInventoryItem,
  ReferenceResponse,
  WishlistItemResponse,
  WishlistSummaryEntry,
} from '@orenji/api-client';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { ShipNotesComponent } from '../../../shared/discovery/binder-view/ship-notes.component';
import { gameInfo } from '../../../shared/domain/games';
import { printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { LAST_ACTIVE_LABELS, LastActiveBucket } from '../../../shared/domain/location-labels';
import { MediaUrlPipe } from '../../../shared/pipes/media-url.pipe';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { StarRatingComponent } from '../../../shared/ratings/star-rating.component';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';
import { SegmentOption, SegmentedComponent } from '../../../shared/ui/segmented/segmented.component';
import { iHaveItLabel } from '../../../shared/wishlist/i-have-it.service';
import { wishTerms } from '../../../shared/wishlist/wishlist-labels';
import { itemPriceText } from '../../inventory/data/item-price';

/** A row of "Looking for": a public wish of someone else, or one of your own (with its id). */
export interface LookingForRow {
  key: string;
  cardId: string | null;
  name: string;
  imageUrl: string | null;
  game: string | null;
  terms: string;
  note: string | null;
  printingId: string | null;
  rarity: string | null;
  /** Your own wish's id (its Edit link). */
  wishId: string | null;
}

/** The rows of Looking for from the public wishlist (another collector's). */
export function lookingForOf(entries: readonly WishlistSummaryEntry[]): LookingForRow[] {
  return entries.map((entry, index) => ({
    key: `${entry.card?.id ?? 'card'}-${index}`,
    cardId: entry.card?.id ?? null,
    name: entry.card?.name ?? 'A card',
    imageUrl: entry.card?.imageUrl ?? null,
    // The public wishlist names no game per wish: no monogram on another collector's rows.
    game: null,
    terms: wishTerms(entry),
    note: entry.note?.trim() || null,
    printingId: entry.printing?.id ?? null,
    rarity: entry.rarity ?? null,
    wishId: null,
  }));
}

/** The rows of Looking for from your own wishlist (`GET /wishlist`, with the wish ids). */
export function ownLookingFor(wishes: readonly WishlistItemResponse[]): LookingForRow[] {
  return wishes.map((wish) => ({
    key: wish.id,
    cardId: wish.card?.id ?? null,
    name: wish.card?.name ?? 'A card',
    imageUrl: wish.card?.imageUrl ?? null,
    game: wish.game ?? null,
    terms: wishTerms(wish),
    note: wish.note?.trim() || null,
    printingId: wish.printing?.id ?? null,
    rarity: wish.rarity ?? null,
    wishId: wish.id,
  }));
}

/**
 * The fact line of the header: "Laval, Quebec · Member since 2024 · Active this week". The city
 * only while its owner shows it (the API sends it only then), the province, never the country's
 * map or a link to it (R6).
 */
export function placeLine(profile: Pick<CollectorProfileResponse, 'location'>): string | null {
  const location = profile.location;
  if (!location) {
    return null;
  }
  const province = location.subdivisionName || location.countryName;
  return location.city ? `${location.city}, ${province}` : province;
}

/** Rows shown before "See all" (the board's two rows of six cards, four wishes). */
export const CARDS_PREVIEW = 12;
export const WISHES_PREVIEW = 4;
export const BINDERS_PREVIEW = 3;

/**
 * A collector profile (spec 11, boards W23 and W23b): the header card (avatar 96 with the online
 * dot, the name, "@handle · ★4.9", the games and tags, the fact line with the city only while
 * shown), the actions (another collector: Message and "⋯" with Share profile, Report and Block;
 * your own: Edit profile, Share profile and the gear), then the main column (Cards with the game
 * control and See all, Binders, Looking for with "I have it" or Edit, no availability) and the
 * side column (About, Ratings & references with the 2 latest references, how deals go). The
 * page loads the data; this view only shows it and says what was asked.
 */
@Component({
  selector: 'app-collector-profile-view',
  imports: [
    DatePipe,
    RouterLink,
    MatMenuModule,
    AvatarComponent,
    CardImageComponent,
    GameMonogramComponent,
    MediaUrlPipe,
    RelativeTimePipe,
    SegmentedComponent,
    ShellIconComponent,
    ShipNotesComponent,
    StarRatingComponent,
  ],
  templateUrl: './collector-profile-view.component.html',
  styleUrl: './collector-profile-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectorProfileViewComponent {
  readonly profile = input.required<CollectorProfileResponse>();
  /** True when the signed-in collector is looking at their own profile. */
  readonly isOwn = input(false);
  /** Public binders (`null` while loading). */
  readonly binders = input<readonly PublicBinderSummary[] | null>(null);
  readonly bindersFailed = input(false);
  /** The public cards shown (`null` while loading), how many there are, and whether more load. */
  readonly publicItems = input<readonly PublicInventoryItem[] | null>(null);
  readonly publicItemCount = input(0);
  readonly cardsFailed = input(false);
  readonly cardsExpanded = input(false);
  readonly cardsHasMore = input(false);
  readonly cardsLoadingMore = input(false);
  /** The game the Cards show, and the games to choose from (2 or more: the control shows). */
  readonly cardGame = input<string | null>(null);
  readonly cardGames = input<readonly string[]>([]);
  /** Looking for (`null` while loading; empty when hidden or empty). */
  readonly lookingFor = input<readonly LookingForRow[] | null>(null);
  /** The conversation with this collector is being opened. */
  readonly messaging = input(false);
  /** Fresher rating summary than the profile's (after the ratings section loaded). */
  readonly rating = input<CollectorRating | null>(null);
  /** The 2 latest references (`null` while loading). */
  readonly references = input<readonly ReferenceResponse[] | null>(null);

  readonly retryBinders = output<void>();
  readonly retryCards = output<void>();
  readonly messageRequested = output<void>();
  readonly reportRequested = output<void>();
  readonly blockRequested = output<void>();
  readonly unblockRequested = output<void>();
  readonly shareRequested = output<void>();
  /** "★4.9" or "See all references": the full ratings section. */
  readonly ratingsRequested = output<void>();
  readonly cardGameChange = output<string>();
  /** "See all" (first press) and "Load more" of the Cards. */
  readonly moreCards = output<void>();
  readonly haveIt = output<{ row: LookingForRow; opener: EventTarget | null }>();

  protected readonly ratingSummary = computed(() => this.rating() ?? this.profile().rating);
  protected readonly average = computed(() => {
    const average = this.ratingSummary().average;
    return average === null || average === undefined ? null : average.toFixed(1);
  });
  protected readonly place = computed(() => placeLine(this.profile()));
  protected readonly activeLabel = computed(() => {
    const bucket = this.profile().lastActiveBucket as LastActiveBucket;
    return bucket && bucket !== 'HIDDEN' ? LAST_ACTIVE_LABELS[bucket] : null;
  });
  protected readonly gameOptions = computed<SegmentOption<string>[]>(() =>
    this.cardGames().map((slug) => ({ value: slug, label: gameInfo(slug).shortLabel })),
  );
  /** "See all" of Binders and Looking for (another collector's: inline). */
  protected readonly allWishes = signal(false);
  protected readonly allBinders = signal(false);
  protected readonly shownBinders = computed(() => {
    const binders = this.binders() ?? [];
    return this.allBinders() ? binders : binders.slice(0, BINDERS_PREVIEW);
  });
  protected readonly shownWishes = computed(() => {
    const rows = this.lookingFor() ?? [];
    return this.allWishes() ? rows : rows.slice(0, WISHES_PREVIEW);
  });
  protected readonly gameLabel = (slug: string) => gameInfo(slug).label;
  protected readonly price = itemPriceText;
  protected readonly haveLabel = iHaveItLabel;
  protected readonly wishesPreview = WISHES_PREVIEW;
  protected readonly bindersPreview = BINDERS_PREVIEW;

  /** The card's own photo first, else its printing's picture (from `/public/card-images`). */
  protected picture(item: PublicInventoryItem): string | null {
    return item.images[0]?.url ?? printingImageUrl(item.printing);
  }

  protected binderCover(binder: PublicBinderSummary): string | null {
    return binder.photos?.[0]?.url ?? null;
  }

  protected binderArts(binder: PublicBinderSummary): string[] {
    return (binder.previewImages ?? []).slice(0, 3);
  }

  protected binderLine(binder: PublicBinderSummary): string {
    const count = `${binder.itemCount} ${binder.itemCount === 1 ? 'card' : 'cards'}`;
    return binder.freshness?.label ? `${count} · ${binder.freshness.label}` : count;
  }

  protected toggleWishes(): void {
    this.allWishes.update((all) => !all);
  }

  protected toggleBinders(): void {
    this.allBinders.update((all) => !all);
  }
}
