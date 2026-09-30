import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import type {
  CollectorProfileResponse,
  PublicBinderSummary,
  PublicInventoryItem,
} from '@orenji/api-client';
import {
  LAST_ACTIVE_LABELS,
  LastActiveBucket,
  distanceBucketLabel,
  lastActiveTone,
} from '../../../shared/domain/location-labels';
import { PublicBinderCardComponent } from '../../../shared/inventory/public-binder-card/public-binder-card.component';
import { PublicItemCardComponent } from '../../../shared/inventory/public-item-card/public-item-card.component';
import { ApproximateAreaMapComponent } from '../../../shared/map/approximate-area-map/approximate-area-map.component';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { CardArtComponent } from '../../../shared/ui/card-art/card-art.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { GameChipComponent } from '../../../shared/ui/game-chip/game-chip.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

/** Presentational public profile: header, actions, about, location, ratings, binders and cards. */
@Component({
  selector: 'app-collector-profile-view',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    ApproximateAreaMapComponent,
    AvatarComponent,
    CardArtComponent,
    EmptyStateComponent,
    GameChipComponent,
    PublicBinderCardComponent,
    PublicItemCardComponent,
    SkeletonComponent,
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
  /** Preview of the public cards (`null` while loading) and their total. */
  readonly publicItems = input<readonly PublicInventoryItem[] | null>(null);
  readonly publicItemCount = input(0);
  readonly retryBinders = output<void>();

  /** The binder the "View public binder" button opens (the owner's first one). */
  protected readonly firstBinder = computed(() => this.binders()?.[0] ?? null);

  protected readonly distanceLabel = computed(() =>
    distanceBucketLabel(this.profile().location?.distanceBucket),
  );
  protected readonly lastActiveLabel = computed(
    () => LAST_ACTIVE_LABELS[this.profile().lastActiveBucket as LastActiveBucket] ?? null,
  );
  protected readonly lastActiveTone = computed(() =>
    lastActiveTone(this.profile().lastActiveBucket),
  );
  protected readonly heroGames = computed(() => {
    const games = this.profile().games;
    return games.length > 0 ? games.slice(0, 3) : ['pokemon', 'mtg', 'yugioh'];
  });
}
