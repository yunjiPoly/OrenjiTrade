import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import type { WishlistItemResponse } from '@orenji/api-client';
import { CardImageComponent } from '../../../shared/catalog/card-image/card-image.component';
import { printingCode, printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { GameChipComponent } from '../../../shared/ui/game-chip/game-chip.component';
import { matchCountLabel, wishCriteriaChips } from '../../../shared/wishlist/wishlist-labels';

/**
 * One wish: card picture, name (links to the catalog), printing or "Any printing", criteria
 * chips, private notes, the matches button (opens the drawer), the alert switch and a menu
 * (edit, remove). Paused wishes are dimmed.
 */
@Component({
  selector: 'app-wish-card',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSlideToggleModule,
    CardImageComponent,
    GameChipComponent,
    RelativeTimePipe,
  ],
  template: `
    @let wish = item();
    <article
      class="wc"
      [class.wc--paused]="!wish.active"
      [class.wc--matched]="wish.active && wish.matchCount > 0"
      [attr.aria-labelledby]="titleId()"
      [attr.data-wish]="wish.id"
    >
      <div class="wc__media">
        <app-card-image [src]="image()" [alt]="name()" [game]="wish.game" />
        @if (wish.active && wish.matchCount > 0) {
          <span class="wc__flag" aria-hidden="true">
            <mat-icon>local_fire_department</mat-icon>
          </span>
        }
      </div>
      <div class="wc__body">
        <div class="wc__head">
          <div class="wc__titles">
            <app-game-chip [slug]="wish.game" />
            <h3 class="wc__name" [id]="titleId()">
              @if (wish.card; as card) {
                <a
                  class="wc__link"
                  [routerLink]="['/cards', card.id]"
                  [queryParams]="cardQuery()"
                  >{{ card.name }}</a
                >
              } @else {
                {{ name() }}
              }
            </h3>
            <p class="wc__printing">
              @if (wish.printing; as printing) {
                <span class="mono">{{ code() }}</span>
                @if (printing.setName) {
                  · {{ printing.setName }}
                }
              } @else {
                Any printing
              }
            </p>
          </div>
          <button
            matIconButton
            type="button"
            class="wc__menu"
            [matMenuTriggerFor]="menu"
            [attr.aria-label]="'Options for ' + name()"
            [disabled]="busy()"
          >
            <mat-icon>more_vert</mat-icon>
          </button>
          <mat-menu #menu="matMenu" xPosition="before">
            <button mat-menu-item type="button" (click)="edit.emit()">
              <mat-icon>edit</mat-icon>
              <span>Edit wish</span>
            </button>
            <button mat-menu-item type="button" (click)="openMatches.emit()">
              <mat-icon>travel_explore</mat-icon>
              <span>See matches</span>
            </button>
            <button mat-menu-item type="button" class="wc__danger" (click)="remove.emit()">
              <mat-icon>delete</mat-icon>
              <span>Remove from wishlist</span>
            </button>
          </mat-menu>
        </div>

        <ul class="wc__chips" [attr.aria-label]="'What you want for ' + name()">
          @for (chip of chips(); track chip.kind) {
            <li class="wc__chip" [attr.data-kind]="chip.kind">
              <mat-icon aria-hidden="true">{{ chip.icon }}</mat-icon>
              {{ chip.label }}
            </li>
          }
        </ul>

        @if (wish.notes) {
          <p class="wc__notes">
            <mat-icon aria-hidden="true">lock</mat-icon>
            <span class="visually-hidden">Private note:</span>
            {{ wish.notes }}
          </p>
        }

        <div class="wc__foot">
          <button
            [matButton]="wish.active && wish.matchCount > 0 ? 'tonal' : 'text'"
            type="button"
            class="wc__matches"
            data-testid="wish-matches"
            [attr.aria-label]="matches() + ' for ' + name()"
            (click)="openMatches.emit()"
          >
            <mat-icon aria-hidden="true">{{
              wish.matchCount > 0 ? 'travel_explore' : 'hourglass_empty'
            }}</mat-icon>
            {{ matches() }}
          </button>
          <mat-slide-toggle
            class="wc__toggle"
            [checked]="wish.active"
            [disabled]="busy()"
            [aria-label]="'Match alerts for ' + name()"
            (change)="activeChange.emit($event.checked)"
          >
            Alerts
          </mat-slide-toggle>
        </div>
        @if (wish.lastMatchedAt) {
          <p class="wc__last">
            Last match
            <time [attr.datetime]="wish.lastMatchedAt">{{
              wish.lastMatchedAt | relativeTime
            }}</time>
          </p>
        }
      </div>
    </article>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .wc {
      display: flex;
      gap: var(--spacing-4);
      height: 100%;
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      transition:
        transform var(--motion-duration-fast) var(--motion-easing-standard),
        box-shadow var(--motion-duration-fast) var(--motion-easing-standard),
        opacity var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .wc:hover,
    .wc:focus-within {
      transform: translateY(-2px);
      box-shadow: var(--elevation-menu);
    }
    .wc--matched {
      border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border));
    }
    .wc--paused .wc__media,
    .wc--paused .wc__chips {
      opacity: 0.55;
    }
    .wc__media {
      position: relative;
      flex: 0 0 92px;
      width: 92px;
    }
    .wc__flag {
      position: absolute;
      top: -8px;
      right: -8px;
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--color-primary);
      color: var(--color-on-primary);
      box-shadow: 0 0 0 3px var(--color-surface);
    }
    .wc__flag mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .wc__body {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: var(--spacing-2);
      min-width: 0;
    }
    .wc__head {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-2);
    }
    .wc__titles {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      min-width: 0;
    }
    .wc__name {
      font-family: var(--font-body);
      font-size: var(--font-size-lg);
      line-height: 1.25;
    }
    .wc__link {
      color: var(--color-ink);
      text-decoration: none;
    }
    .wc__link:hover {
      color: var(--color-primary);
    }
    .wc__printing {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .wc__menu {
      flex: 0 0 auto;
      margin: -8px -8px 0 0;
    }
    .wc__chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .wc__chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
    }
    .wc__chip mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
      color: var(--color-text-muted);
    }
    .wc__chip[data-kind='price'],
    .wc__chip[data-kind='radius'] {
      background: var(--color-accent-container);
      color: var(--color-on-accent-container);
    }
    .wc__chip[data-kind='price'] mat-icon,
    .wc__chip[data-kind='radius'] mat-icon {
      color: inherit;
    }
    .wc__notes {
      display: flex;
      gap: 4px;
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-style: italic;
    }
    .wc__notes mat-icon {
      flex: 0 0 auto;
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .wc__foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
      margin-top: auto;
      padding-top: var(--spacing-1);
    }
    .wc__matches {
      margin-left: -12px;
    }
    .wc__last {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .wc__danger {
      color: var(--color-danger);
    }
    @media (max-width: 599px) {
      .wc {
        padding: var(--spacing-3);
        gap: var(--spacing-3);
      }
      .wc__media {
        flex-basis: 72px;
        width: 72px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishCardComponent {
  readonly item = input.required<WishlistItemResponse>();
  /** An update or removal of this wish is running. */
  readonly busy = input(false);

  readonly openMatches = output<void>();
  readonly edit = output<void>();
  readonly remove = output<void>();
  readonly activeChange = output<boolean>();

  protected readonly titleId = computed(() => `wish-${this.item().id}`);
  protected readonly name = computed(() => this.item().card?.name ?? 'Unknown card');
  protected readonly image = computed(
    () => printingImageUrl(this.item().printing) ?? this.item().card?.imageUrl ?? null,
  );
  protected readonly code = computed(() => printingCode(this.item().printing));
  protected readonly cardQuery = computed(() => {
    const printingId = this.item().printing?.id;
    return printingId ? { printing: printingId } : {};
  });
  protected readonly chips = computed(() => wishCriteriaChips(this.item()));
  protected readonly matches = computed(() => matchCountLabel(this.item().matchCount));
}
