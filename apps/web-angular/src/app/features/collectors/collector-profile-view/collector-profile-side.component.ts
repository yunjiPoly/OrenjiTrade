import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  CollectorProfileResponse,
  CollectorRating,
  ReferenceResponse,
} from '@orenji/api-client';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { ShipNotesComponent } from '../../../shared/discovery/binder-view/ship-notes.component';
import { gameInfo } from '../../../shared/domain/games';
import { StarRatingComponent } from '../../../shared/ratings/star-rating.component';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';

/**
 * A profile's side column (spec 11, boards W23 and W23b; 336, sticky): About (bio, games, tags),
 * Ratings & references (the average, the stars, the count, the 2 latest references and "See all
 * references"), then how deals go, or, on your own profile, where your city shows.
 */
@Component({
  selector: 'app-collector-profile-side',
  imports: [
    DatePipe,
    RouterLink,
    AvatarComponent,
    GameMonogramComponent,
    ShellIconComponent,
    ShipNotesComponent,
    StarRatingComponent,
  ],
  template: `
    @let p = profile();
    @let r = rating();
    <section class="cp__panel" aria-labelledby="collector-about">
      <h2 class="cp__h2" id="collector-about">About</h2>
      @if (p.bio) {
        <p class="cp__bio">{{ p.bio }}</p>
      } @else {
        <p class="cp__muted">
          {{ isOwn() ? 'Say what you collect and trade in Edit profile.' : 'No bio yet.' }}
        </p>
      }
      @if (p.games.length > 0 || p.tags.length > 0) {
        <dl class="cp__facts-list">
          @if (p.games.length > 0) {
            <dt>Games</dt>
            <dd>
              @for (game of p.games; track game) {
                <span class="cp__game"
                  ><app-game-monogram [game]="game" [size]="16" /> {{ gameLabel(game) }}</span
                >
              }
            </dd>
          }
          @if (p.tags.length > 0) {
            <dt>Tags</dt>
            <dd>
              @for (tag of p.tags; track tag.slug; let last = $last) {
                {{ tag.label }}{{ last ? '' : ' · ' }}
              }
            </dd>
          }
        </dl>
      }
    </section>

    <div class="cp__panel">
      <h2 class="cp__h2">Ratings &amp; references</h2>
      @if (r.count > 0 && average(); as avg) {
        <div class="cp__score" data-testid="profile-rating">
          <span class="cp__avg">{{ avg }}</span>
          <span class="cp__stars">
            <app-star-rating [value]="r.average" size="sm" />
            <span class="cp__muted">{{ r.count }} {{ r.count === 1 ? 'rating' : 'ratings' }}</span>
          </span>
        </div>
      } @else {
        <p class="cp__muted" data-testid="profile-rating">No ratings yet.</p>
      }
      @if (references(); as refs) {
        @if (refs.length > 0) {
          <ul class="cp__refs" aria-label="Latest references">
            @for (ref of refs; track ref.id) {
              <li class="cp__ref">
                <app-avatar
                  class="cp__ref-avatar"
                  [src]="ref.author.avatarUrl"
                  [name]="ref.author.displayName"
                  [decorative]="true"
                />
                <span>
                  <span class="cp__ref-who"
                    ><a [routerLink]="['/collectors', ref.author.handle]">{{
                      ref.author.handle
                    }}</a>
                    <span class="cp__muted"> · {{ ref.createdAt | date: 'MMM y' }}</span></span
                  >
                  <span class="cp__ref-body">{{ ref.body }}</span>
                </span>
              </li>
            }
          </ul>
        }
      }
      <button type="button" class="cp__text cp__text--block" (click)="ratingsRequested.emit()">
        See all references
      </button>
    </div>

    @if (isOwn()) {
      <div class="cp__panel cp__panel--notes">
        <p class="cp__note-row">
          <app-shell-icon name="mail" [size]="18" />
          <span
            >Deals happen in the chat. Cards ship by mail, and the buyer pays by e-Transfer outside
            OrenjiTrade.</span
          >
        </p>
        <p class="cp__note-row">
          <app-shell-icon class="cp__teal" name="lock" [size]="18" />
          <span>
            Your city is optional and only on your profile. Search, binders, chats and the map never
            show it.
            <a routerLink="/settings/location">Location settings</a>
          </span>
        </p>
      </div>
    } @else {
      <app-ship-notes />
    }
  `,
  styleUrl: './collector-profile-side.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectorProfileSideComponent {
  readonly profile = input.required<CollectorProfileResponse>();
  readonly isOwn = input(false);
  readonly rating = input.required<CollectorRating>();
  /** "4.9", or null without a rating. */
  readonly average = input<string | null>(null);
  readonly references = input<readonly ReferenceResponse[] | null>(null);
  readonly ratingsRequested = output<void>();
  protected readonly gameLabel = (slug: string) => gameInfo(slug).label;
}
