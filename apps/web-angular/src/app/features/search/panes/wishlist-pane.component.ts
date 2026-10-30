import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterEveryRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { SettingsService, WishlistService } from '@orenji/api-client';
import type { WishlistItemResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/feedback/toast.service';
import { silentErrors } from '../../../core/http/http-context';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { WishlistActions, addedMessage } from '../../../shared/wishlist/wishlist-actions.service';
import { wishTerms } from '../../../shared/wishlist/wishlist-labels';
import { WishlistStore } from '../../wishlist/data/wishlist.store';

/** A wish's terms on one line (moved to the shared labels for Home and profiles, stage WE). */
export { wishTerms };

/** The bulk remove's confirmation: "for it" for one wish, "for them" for several. */
export function removeConfirmation(count: number): ConfirmDialogData {
  return {
    title: count === 1 ? 'Remove this wish?' : `Remove ${count} wishes?`,
    message: count === 1 ? 'You stop getting alerts for it.' : 'You stop getting alerts for them.',
    confirmLabel: 'Remove from wishlist',
    tone: 'danger',
  };
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
        <span class="wp__guest-icon" aria-hidden="true"
          ><app-shell-icon name="star" [size]="28"
        /></span>
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
            <span class="wp__switch-text" id="wp-alerts"
              >Tell me when someone in my region lists one</span
            >
            <button
              type="button"
              role="switch"
              class="wp__switch"
              data-testid="wishlist-alerts-switch"
              aria-labelledby="wp-alerts"
              [attr.aria-checked]="alerts() === true"
              [disabled]="alerts() === null || savingAlerts()"
              (click)="toggleAlerts()"
            >
              <span class="visually-hidden">Wishlist alerts</span>
            </button>
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
            >
              <span class="visually-hidden">Wishlist visible to others</span>
            </button>
          </div>
        </div>
        @if (store.readiness() === 'no-location') {
          <p class="wp__prompt" role="note" data-testid="wishlist-location-prompt">
            Choose your state or province in
            <a routerLink="/settings/location">Settings › Location</a> so collectors of your region
            can be found for your wishes.
          </p>
        }
        <button
          type="button"
          class="wp__add"
          data-testid="add-wish"
          [disabled]="actions.opening()"
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
            <button
              type="button"
              class="wp__select"
              [attr.aria-pressed]="selecting()"
              (click)="toggleSelecting()"
            >
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
                      <app-card-image
                        class="wp__art"
                        [src]="wish.card?.imageUrl"
                        [game]="wish.game"
                        alt=""
                      />
                      <span class="wp__text-col">
                        <span class="wp__name">{{ wish.card?.name }}</span>
                        <span class="wp__terms">{{ terms(wish) }}</span>
                      </span>
                      @if (available) {
                        <span class="wp__available"
                          ><span class="wp__dot" aria-hidden="true"></span>Available</span
                        >
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
        <div #dock class="wp__dock" role="region" aria-label="Selected wishes">
          @if (removeError(); as error) {
            <p class="wp__dock-error" role="alert" data-testid="wish-remove-error">
              {{ error }}
              <button
                type="button"
                class="wp__text"
                [disabled]="removing()"
                (click)="removePicked(false)"
              >
                Try again
              </button>
            </p>
          }
          <div class="wp__dock-row">
            <span>{{ picked().size }} selected</span>
            <button
              type="button"
              class="wp__danger"
              [disabled]="removing()"
              (click)="removePicked()"
            >
              Remove from wishlist
            </button>
          </div>
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
  /** A bulk remove that failed: what stays selected, said plainly, with Try again. */
  protected readonly removeError = signal<string | null>(null);
  private readonly layout = inject(ShellLayout);
  private readonly dock = viewChild<ElementRef<HTMLElement>>('dock');
  private readonly available = signal<ReadonlySet<string>>(new Set());

  /** The listed wishes' ids, `null` until listed or signed out (the availability's trigger). */
  private readonly wishIds = computed(() =>
    this.auth.isAuthenticated() && this.store.status() === 'ready'
      ? this.store
          .items()
          .map((wish) => wish.id)
          .join(',')
      : null,
  );

  /** The browsed game's wishes only (stage G). */
  protected readonly wishes = computed(() =>
    this.store.items().filter((wish) => wish.game === this.game()),
  );
  protected readonly limitLine = computed(() => {
    const usage = this.store.usage();
    return usage ? wishLimitLine(usage.used, usage.limit) : null;
  });
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
    // The toasts rise above the dock while it shows, as tall as it is with its error line and
    // wherever the list puts it (WD review U15 and R1-3).
    effect(() => {
      const dock = this.dock()?.nativeElement ?? null;
      untracked(() => this.layout.trackDock(dock));
    });
    afterEveryRender({ read: () => this.layout.measureDock() });
    inject(DestroyRef).onDestroy(() => this.layout.trackDock(null));
    effect(() => {
      if (this.auth.isAuthenticated()) {
        untracked(() => {
          this.store.init();
          void this.loadAlerts();
        });
      }
    });
    // "Available" for the browsed region and game (ids only, no counts): read once the wishes are
    // listed, and again only when the region, the game or the set of wishes changes, never for
    // the same wishes listed again (WD review F14).
    effect(() => {
      const region = this.region();
      const game = this.game();
      const wishes = this.wishIds();
      untracked(() => {
        if (wishes !== null) {
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
    const on = !this.store.visible();
    try {
      await this.store.setVisible(on);
      this.toasts.show({
        title: on
          ? 'Others can now see what you want on your profile.'
          : 'Your wishlist is hidden from others.',
      });
    } catch {
      // Explained by the error interceptor; the switch shows the saved state.
    }
  }

  protected async add(): Promise<void> {
    const item = await this.actions.add({}, false);
    if (item) {
      this.store.upsert(item);
      this.toasts.show({ title: addedMessage(item) });
      if (item.game === this.game()) {
        this.chosen.emit(item);
      }
    }
  }

  protected toggleSelecting(): void {
    this.selecting.set(!this.selecting());
    this.picked.set(new Set());
    this.removeError.set(null);
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

  /**
   * Removes the picked wishes one by one (after the confirmation; "Try again" skips it). When one
   * fails, the wishes not removed stay selected and the dock says so with Try again.
   */
  protected async removePicked(confirm = true): Promise<void> {
    const ids = [...this.picked()];
    const count = ids.length;
    if (confirm) {
      const confirmed = await firstValueFrom(
        this.dialog
          .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
            data: removeConfirmation(count),
            autoFocus: 'first-tabbable',
            restoreFocus: true,
          })
          .afterClosed(),
      );
      if (!confirmed) {
        return;
      }
    }
    this.removing.set(true);
    this.removeError.set(null);
    let removed = 0;
    const left = new Set(ids);
    for (const id of ids) {
      const wish = this.store.find(id);
      if (!wish) {
        left.delete(id);
        continue;
      }
      try {
        await this.store.remove(wish);
        left.delete(id);
        removed++;
      } catch {
        break;
      }
    }
    this.removing.set(false);
    if (removed > 0) {
      this.toasts.show({
        title: removed === 1 ? 'Removed from your wishlist' : `${removed} wishes removed`,
      });
    }
    if (left.size > 0) {
      this.picked.set(left);
      this.removeError.set(
        left.size === 1
          ? 'This wish could not be removed.'
          : `${left.size} wishes could not be removed.`,
      );
      return;
    }
    this.picked.set(new Set());
    this.selecting.set(false);
  }
}
