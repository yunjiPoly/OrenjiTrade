import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { SettingsService, WishlistService } from '@orenji/api-client';
import type { WishlistItemResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/feedback/toast.service';
import { silentErrors } from '../../../core/http/http-context';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { printingCode } from '../../../shared/inventory/inventory-labels';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { WishlistActions } from '../../../shared/wishlist/wishlist-actions.service';
import { WishlistStore } from '../../wishlist/data/wishlist.store';

/** "Any printing · 90% TCG", "TN19-EN013 · NM only" (spec 6.6: a wish's terms on one line). */
export function wishTerms(wish: Pick<WishlistItemResponse, 'printing' | 'rarity' | 'nearMintOnly' | 'priceTerm'>): string {
  const copy = wish.printing
    ? printingCode(wish.printing) || 'One printing'
    : wish.rarity
      ? `Any ${wish.rarity}`
      : 'Any printing';
  return [copy, wish.nearMintOnly ? 'NM only' : null, wish.priceTerm?.label ?? null]
    .filter(Boolean)
    .join(' · ');
}

/** "You have 20 wishes, the most each collector can have. Every collector has the same limits." */
export function wishLimitLine(used: number, limit: number | null): string | null {
  return limit !== null && used >= limit
    ? `You have ${used} wishes, the most each collector can have. Every collector has the same limits.`
    : null;
}

/**
 * Search › Wishlist (spec 6.6, board W6), the list pane: a switch card ("Tell me when someone in
 * my region lists one", the account's wishlist alerts; "Let others see what you want", the privacy
 * setting), a dashed orange [Add a wish], and the browsed game's wishes (72 rows: art, name,
 * terms, "Available" in teal or "None yet" for the browsed region, stage G); "Select" turns on
 * checkboxes and a dock with [Remove from wishlist]. Choosing a wish shows who has it in the map's
 * pane. A guest reads "Get told when it's listed" with [Create account] and [Sign in].
 */
@Component({
  selector: 'app-wishlist-pane',
  imports: [RouterLink, CardImageComponent, ShellIconComponent],
  template: `
    @if (!auth.isAuthenticated()) {
      <section class="wp__guest" aria-labelledby="wp-guest-title">
        <span class="wp__guest-icon" aria-hidden="true"><app-shell-icon name="star" [size]="28" /></span>
        <h2 class="wp__guest-title" id="wp-guest-title">Get told when it's listed</h2>
        <p class="wp__guest-text">
          Add the cards you are looking for. We tell you when a collector of your region lists one.
        </p>
        <a class="wp__primary" routerLink="/auth/sign-up" [queryParams]="{ returnUrl: returnUrl() }"
          >Create account</a
        >
        <a class="wp__outline" routerLink="/auth/sign-in" [queryParams]="{ returnUrl: returnUrl() }"
          >Sign in</a
        >
      </section>
    } @else {
      <div class="wp">
        <div class="wp__switches">
          <div class="wp__switch-row">
            <app-shell-icon class="wp__orange" name="bell" [size]="20" />
            <span class="wp__switch-text" id="wp-alerts">Tell me when someone in my region lists one</span>
            <button
              type="button"
              role="switch"
              class="wp__switch"
              data-testid="wishlist-alerts-switch"
              aria-labelledby="wp-alerts"
              [attr.aria-checked]="alerts() === true"
              [disabled]="alerts() === null || savingAlerts()"
              (click)="toggleAlerts()"
            ></button>
          </div>
          <div class="wp__switch-row">
            <app-shell-icon class="wp__teal" name="eye" [size]="20" />
            <span class="wp__switch-text">
              <span id="wp-visible">Let others see what you want</span>
              <span class="wp__switch-help" id="wp-visible-help"
                >Collectors who have these cards can message you</span
              >
            </span>
            <button
              type="button"
              role="switch"
              class="wp__switch"
              data-testid="wishlist-visible"
              aria-labelledby="wp-visible"
              aria-describedby="wp-visible-help"
              [attr.aria-checked]="store.visible() === true"
              [disabled]="store.visible() === null || store.savingVisibility()"
              (click)="toggleVisible()"
            ></button>
          </div>
        </div>
        @if (store.readiness() === 'no-location') {
          <p class="wp__prompt" role="note">
            Choose your state or province in
            <a routerLink="/settings/location">Settings › Location</a> so collectors of your region
            can be found for your wishes.
          </p>
        }
        <button
          type="button"
          class="wp__add"
          data-testid="add-wish"
          [disabled]="actions.opening() || atLimit()"
          (click)="add()"
        >
          <app-shell-icon name="plus" [size]="18" /> Add a wish
        </button>
        @if (limitLine(); as line) {
          <p class="wp__limit" role="note">{{ line }}</p>
        }

        <div class="wp__head">
          <h2 class="wp__label">Your wishes</h2>
          @if (wishes().length > 0) {
            <button type="button" class="wp__select" [attr.aria-pressed]="selecting()" (click)="toggleSelecting()">
              {{ selecting() ? 'Done' : 'Select' }}
            </button>
          }
        </div>

        @switch (store.status()) {
          @case ('loading') {
            <div aria-busy="true">
              <span class="visually-hidden" role="status">Loading your wishlist</span>
              @for (bone of [0, 1, 2, 3]; track bone) {
                <span class="wp__bone" aria-hidden="true"></span>
              }
            </div>
          }
          @case ('error') {
            <div class="wp__state" role="alert">
              <p>Your wishlist could not load.</p>
              <button type="button" class="wp__text" (click)="store.load()">Try again</button>
            </div>
          }
          @default {
            @if (wishes().length === 0) {
              <div class="wp__state">
                <p class="wp__state-title">{{ emptyTitle() }}</p>
                <p>{{ emptyHint() }}</p>
              </div>
            } @else {
              <ul class="wp__rows" aria-label="Your wishes">
                @for (wish of wishes(); track wish.id) {
                  @let available = isAvailable(wish);
                  <li class="wp__row" [class.wp__row--active]="wish.id === selectedId()">
                    @if (selecting()) {
                      <input
                        type="checkbox"
                        class="wp__check"
                        [attr.aria-label]="'Select ' + (wish.card?.name ?? 'this wish')"
                        [checked]="picked().has(wish.id)"
                        (change)="togglePick(wish.id)"
                      />
                    }
                    <button
                      type="button"
                      class="wp__open"
                      data-testid="wish-row"
                      [attr.aria-current]="wish.id === selectedId() ? 'true' : null"
                      [attr.aria-label]="rowLabel(wish, available)"
                      (click)="selecting() ? togglePick(wish.id) : chosen.emit(wish)"
                    >
                      <app-card-image class="wp__art" [src]="wish.card?.imageUrl" [game]="wish.game" alt="" />
                      <span class="wp__text-col">
                        <span class="wp__name">{{ wish.card?.name }}</span>
                        <span class="wp__terms">{{ terms(wish) }}</span>
                      </span>
                      @if (available) {
                        <span class="wp__available"><span class="wp__dot" aria-hidden="true"></span>Available</span>
                      } @else {
                        <span class="wp__none">None yet</span>
                      }
                    </button>
                  </li>
                }
              </ul>
            }
          }
        }
      </div>
      @if (selecting() && picked().size > 0) {
        <div class="wp__dock" role="region" aria-label="Selected wishes">
          <span>{{ picked().size }} selected</span>
          <button type="button" class="wp__danger" [disabled]="removing()" (click)="removePicked()">
            Remove from wishlist
          </button>
        </div>
      }
    }
  `,
  styleUrl: './wishlist-pane.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishlistPaneComponent {
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(WishlistStore);
  protected readonly actions = inject(WishlistActions);
  private readonly settings = inject(SettingsService);
  private readonly wishlistApi = inject(WishlistService);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);

  readonly region = input.required<string>();
  readonly game = input.required<string>();
  readonly gameName = input('');
  readonly selectedId = input<string | null>(null);
  readonly returnUrl = input('/search?tab=wishlist');
  readonly chosen = output<WishlistItemResponse>();

  protected readonly alerts = signal<boolean | null>(null);
  protected readonly savingAlerts = signal(false);
  protected readonly selecting = signal(false);
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  protected readonly removing = signal(false);
  private readonly available = signal<ReadonlySet<string>>(new Set());

  /** The browsed game's wishes only (stage G). */
  protected readonly wishes = computed(() =>
    this.store.items().filter((wish) => wish.game === this.game()),
  );
  protected readonly limitLine = computed(() => {
    const usage = this.store.usage();
    return usage ? wishLimitLine(usage.used, usage.limit) : null;
  });
  protected readonly atLimit = computed(() => !!this.limitLine());
  protected readonly emptyTitle = computed(() =>
    this.store.items().length > 0 ? `No ${this.gameName()} wishes yet` : 'No wishes yet',
  );
  protected readonly emptyHint = computed(() =>
    this.store.items().length > 0
      ? `Add the ${this.gameName()} cards you are looking for. Your other games' wishes show when you switch game.`
      : 'Add the cards you are looking for. Wishlist alerts tell you when someone lists one.',
  );
  protected readonly terms = wishTerms;

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        untracked(() => {
          this.store.init();
          void this.loadAlerts();
        });
      }
    });
    // "Available" for the browsed region and game (ids only, no counts).
    effect(() => {
      const region = this.region();
      const game = this.game();
      const signedIn = this.auth.isAuthenticated();
      this.store.items();
      untracked(() => {
        if (signedIn) {
          void this.loadAvailability(region, game);
        }
      });
    });
  }

  protected isAvailable(wish: WishlistItemResponse): boolean {
    return this.available().has(wish.id);
  }

  protected rowLabel(wish: WishlistItemResponse, available: boolean): string {
    return `${wish.card?.name ?? 'A card'}, ${wishTerms(wish)}, ${available ? 'Available' : 'None yet'}`;
  }

  private async loadAvailability(region: string, game: string): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.wishlistApi.getWishlistAvailability({ region, game }, 'body', false, {
          context: silentErrors(),
        }),
      );
      if (region === this.region() && game === this.game()) {
        this.available.set(new Set(result.available ?? []));
      }
    } catch {
      this.available.set(new Set());
    }
  }

  private async loadAlerts(): Promise<void> {
    try {
      const settings = await firstValueFrom(
        this.settings.getNotificationSettings('body', false, { context: silentErrors() }),
      );
      this.alerts.set(!!settings.wishlistAlerts);
    } catch {
      this.alerts.set(null);
    }
  }

  protected async toggleAlerts(): Promise<void> {
    const on = !this.alerts();
    this.savingAlerts.set(true);
    try {
      const current = await firstValueFrom(
        this.settings.getNotificationSettings('body', false, { context: silentErrors() }),
      );
      const saved = await firstValueFrom(
        this.settings.updateNotificationSettings({
          notificationSettingsRequest: { ...current, wishlistAlerts: on },
        }),
      );
      this.alerts.set(!!saved.wishlistAlerts);
      this.toasts.show({
        title: on
          ? 'We tell you when someone in your region lists one of your wishes.'
          : 'Wishlist alerts are off.',
      });
    } catch {
      // The error interceptor says why; the switch keeps its state.
    } finally {
      this.savingAlerts.set(false);
    }
  }

  protected async toggleVisible(): Promise<void> {
    try {
      await this.store.setVisible(!this.store.visible());
    } catch {
      // Explained by the error interceptor; the switch shows the saved state.
    }
  }

  protected async add(): Promise<void> {
    const item = await this.actions.add({}, false);
    if (item) {
      this.store.upsert(item);
      this.toasts.show({ title: 'Added to your wishlist', sub: item.card?.name ?? null });
      if (item.game === this.game()) {
        this.chosen.emit(item);
      }
    }
  }

  protected toggleSelecting(): void {
    this.selecting.set(!this.selecting());
    this.picked.set(new Set());
  }

  protected togglePick(id: string): void {
    const next = new Set(this.picked());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.picked.set(next);
  }

  protected async removePicked(): Promise<void> {
    const ids = [...this.picked()];
    const count = ids.length;
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: count === 1 ? 'Remove this wish?' : `Remove ${count} wishes?`,
            message: 'You stop getting alerts for it.',
            confirmLabel: 'Remove from wishlist',
            tone: 'danger',
          },
          autoFocus: 'first-tabbable',
          restoreFocus: true,
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }
    this.removing.set(true);
    let removed = 0;
    for (const id of ids) {
      const wish = this.store.find(id);
      if (!wish) {
        continue;
      }
      try {
        await this.store.remove(wish);
        removed++;
      } catch {
        break;
      }
    }
    this.removing.set(false);
    this.picked.set(new Set());
    this.selecting.set(false);
    if (removed > 0) {
      this.toasts.show({
        title: removed === 1 ? 'Removed from your wishlist' : `${removed} wishes removed`,
      });
    }
  }
}
