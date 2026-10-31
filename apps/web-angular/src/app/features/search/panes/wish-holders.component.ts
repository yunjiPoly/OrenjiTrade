import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { WishlistItemResponse } from '@orenji/api-client';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { ViewerPlace } from '../../../shared/discovery/who-has/holder-groups';
import { WhoHasComponent } from '../../../shared/discovery/who-has/who-has.component';
import { gameInfo } from '../../../shared/domain/games';
import { selectionQuery } from '../../../shared/catalog/printing-picker/printing-selection';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { wishTerms } from './wishlist-pane.component';

/**
 * The holder pane of Search › Wishlist (spec 6.6, board W6): the map's pane shows who has the
 * chosen wish, filtered to its printing (or any printing of its rarity), grouped by province, under
 * a header with the card, its terms, [Edit wish] and "Open card page". With nothing chosen: "Pick
 * a wish to see who in Americas (North) has it."
 */
@Component({
  selector: 'app-wish-holders',
  imports: [RouterLink, CardImageComponent, ShellIconComponent, WhoHasComponent],
  template: `
    <div class="wh-pane" [id]="paneId()" tabindex="-1">
      @if (wish(); as wish) {
        <header class="whp__head">
          <app-card-image class="whp__art" [src]="wish.card?.imageUrl" [game]="wish.game" alt="" />
          <div class="whp__titles">
            <p class="whp__kicker">{{ gameLabel() }} · On your wishlist</p>
            <h2 class="whp__name">{{ wish.card?.name }}</h2>
            <p class="whp__chips">
              @for (chip of chips(); track chip) {
                <span class="whp__chip">{{ chip }}</span>
              }
            </p>
          </div>
          <div class="whp__actions">
            <button type="button" class="whp__edit" (click)="edit.emit(wish)">
              <app-shell-icon name="pencil" [size]="16" /> Edit wish
            </button>
            @if (wish.card?.id; as cardId) {
              <a class="whp__open" [routerLink]="['/cards', cardId]" [queryParams]="cardQuery()"
                >Open card page <app-shell-icon name="arrowRight" [size]="16"
              /></a>
            }
          </div>
        </header>
        <div class="whp__body">
          <h3 class="whp__h3">
            Who has this card <span class="whp__muted">in {{ regionName() }}</span>
          </h3>
          <p class="whp__lead">{{ lead() }}</p>
          @if (wish.card?.id; as cardId) {
            <app-who-has
              prefix="wish"
              [cardId]="cardId"
              [printingId]="wish.printing?.id ?? null"
              [rarity]="wish.printing ? null : (wish.rarity ?? null)"
              [cardName]="wish.card.name"
              [game]="wish.game"
              [groupLevel]="4"
              [region]="region()"
              [regionName]="regionName()"
              [viewer]="viewer()"
              [offerWish]="false"
              [stickyTop]="0"
            />
          }
        </div>
      } @else {
        <p class="whp__empty">Pick a wish to see who in {{ regionName() }} has it.</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }
    .wh-pane {
      height: 100%;
      overflow-y: auto;
      outline: none;
    }
    .whp__head {
      display: flex;
      align-items: center;
      gap: 20px;
      margin: 20px 20px 0;
      padding: 20px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .whp__art {
      flex: none;
      width: 72px;
      height: 101px;
    }
    .whp__titles {
      flex: 1;
      min-width: 0;
    }
    .whp__kicker {
      margin: 0 0 4px;
      color: var(--app-primary-text);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-bold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .whp__name {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--font-size-xl);
    }
    .whp__chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 8px 0 0;
    }
    .whp__chip {
      padding: 2px 8px;
      border-radius: 6px;
      background: var(--color-surface-variant);
      color: var(--color-text-secondary);
      font-size: var(--font-size-meta);
      font-weight: var(--font-weight-semibold);
    }
    .whp__actions {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
    }
    .whp__edit {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 40px;
      padding: 0 16px;
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-ink);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .whp__open {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .whp__body {
      padding: 24px 20px 32px;
    }
    .whp__h3 {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--font-size-lg);
    }
    .whp__muted {
      color: var(--color-text-muted);
      font-family: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-regular);
    }
    .whp__lead {
      margin: 6px 0 16px;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .whp__empty {
      display: grid;
      place-items: center;
      height: 100%;
      margin: 0;
      padding: 24px;
      color: var(--color-text-muted);
      text-align: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishHoldersComponent {
  readonly wish = input<WishlistItemResponse | null>(null);
  readonly region = input.required<string>();
  readonly regionName = input('');
  readonly viewer = input<ViewerPlace>({ subdivisionCode: null, countryCode: null });
  readonly paneId = input('search-holders');
  readonly edit = output<WishlistItemResponse>();

  protected readonly gameLabel = computed(() => gameInfo(this.wish()?.game ?? '').label);

  constructor() {
    // Choosing a wish fills this pane: a screen reader hears whose holders it shows (no count).
    const announcer = inject(LiveAnnouncer);
    let last: string | null = null;
    effect(() => {
      const wish = this.wish();
      untracked(() => {
        if (wish && wish.id !== last) {
          void announcer.announce(`Who has ${wish.card?.name ?? 'this card'}`, 'polite');
        }
        last = wish?.id ?? null;
      });
    });
  }
  protected readonly chips = computed(() => {
    const wish = this.wish();
    return wish ? wishTerms(wish).split(' · ') : [];
  });
  protected readonly lead = computed(() => {
    const wish = this.wish();
    if (!wish) {
      return '';
    }
    return wish.printing
      ? 'This printing only, as in your wish.'
      : wish.rarity
        ? `Every ${wish.rarity} printing, as in your wish.`
        : 'Every printing, as in your wish.';
  });
  protected readonly cardQuery = computed(() => {
    const wish = this.wish();
    return selectionQuery({
      printingId: wish?.printing?.id ?? null,
      rarity: wish?.printing ? null : (wish?.rarity ?? null),
    });
  });
}
