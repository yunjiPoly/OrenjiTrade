import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import type { WishlistItemResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../shared/ui/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { WishlistActions, addedMessage } from '../../shared/wishlist/wishlist-actions.service';
import { whichCopyLabel } from '../../shared/wishlist/wishlist-labels';
import { WishlistStore } from './data/wishlist.store';
import { WishCardComponent } from './list/wish-card.component';
import { WishlistSummaryComponent } from './list/wishlist-summary.component';

/**
 * `/wishlist` (stage S2): a clean list of the collector's wishes (picture, which copy, public
 * note, "Near Mint only" and price term chips, edit, remove), the plan usage, the "Let others see
 * what you want" switch (privacy setting `wishlistVisible`) and, without a location, a prompt to
 * set country and state so wishlist alerts can arrive. No matches: when a collector of the region
 * lists a fitting card, a wishlist alert opens its card page.
 */
@Component({
  selector: 'app-wishlist-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
    WishCardComponent,
    WishlistSummaryComponent,
  ],
  providers: [WishlistStore],
  template: `
    <div class="page wl">
      @if (auth.isAuthenticated()) {
        <app-page-header
          title="Wishlist"
          subtitle="Cards you are hunting for. We tell you when a collector of your region lists one."
        >
          <button
            actions
            matButton="filled"
            type="button"
            [disabled]="actions.opening()"
            (click)="add()"
          >
            <mat-icon aria-hidden="true">add</mat-icon>
            Add a card
          </button>
        </app-page-header>

        @if (store.readiness() === 'no-location') {
          <aside class="wl__prompt" role="note" data-testid="wishlist-location-prompt">
            <mat-icon class="wl__prompt-icon" aria-hidden="true">location_off</mat-icon>
            <div class="wl__prompt-text">
              <p class="wl__prompt-title">Set your country and state to get wishlist alerts</p>
              <p class="wl__prompt-body">
                Alerts come from collectors of your region. Choose your country and state or
                province once and new listings of the cards you want will reach you.
              </p>
            </div>
            <a matButton="tonal" routerLink="/settings/location">Choose my location</a>
          </aside>
        }

        <section class="wl__visibility" aria-labelledby="wl-visible-title">
          <div class="wl__visibility-text">
            <h2 class="wl__visibility-title" id="wl-visible-title">Let others see what you want</h2>
            <p class="wl__visibility-help">
              Collectors who own these cards can find you on your profile and offer them. Your
              wishlist alerts work either way.
            </p>
          </div>
          @if (store.visible() === null) {
            <app-skeleton width="52px" height="32px" />
          } @else {
            <mat-slide-toggle
              data-testid="wishlist-visible"
              [checked]="!!store.visible()"
              [disabled]="store.savingVisibility()"
              aria-labelledby="wl-visible-title"
              (change)="setVisible($event)"
            />
          }
        </section>

        @switch (store.status()) {
          @case ('loading') {
            <div class="wl__grid" aria-busy="true">
              <span class="visually-hidden">Loading your wishlist</span>
              @for (bone of bones; track bone) {
                <app-skeleton height="170px" />
              }
            </div>
          }
          @case ('error') {
            <app-error-state
              title="Your wishlist could not load"
              [message]="errorMessage()"
              [requestId]="store.error()?.requestId ?? null"
              (retry)="store.load()"
            />
          }
          @default {
            @if (store.items().length) {
              <app-wishlist-summary [count]="store.items().length" [usage]="store.usage()" />
              <ul class="wl__grid" aria-label="Your wishlist">
                @for (item of store.items(); track item.id) {
                  <li>
                    <app-wish-card
                      [item]="item"
                      [busy]="store.busy().has(item.id)"
                      (edit)="edit(item)"
                      (remove)="remove(item)"
                    />
                  </li>
                }
              </ul>
            } @else {
              <app-empty-state
                icon="favorite"
                title="Your wishlist is empty"
                description="Add the cards you are hunting for. We'll let you know as soon as a collector of your region lists one."
              >
                <button actions matButton="filled" type="button" (click)="add()">
                  <mat-icon aria-hidden="true">add</mat-icon>
                  Add a card
                </button>
                <a actions matButton="outlined" routerLink="/cards">Browse cards</a>
              </app-empty-state>
            }
          }
        }
      } @else {
        <app-empty-state
          icon="lock_person"
          title="Wishlists are for members"
          description="Sign in to keep a wishlist and hear when a collector of your region lists a card you want."
        >
          <a actions matButton="filled" routerLink="/auth/sign-in" [queryParams]="{ returnUrl }">
            Sign in
          </a>
          <a actions matButton="outlined" routerLink="/auth/sign-up" [queryParams]="{ returnUrl }">
            Create account
          </a>
        </app-empty-state>
      }
    </div>
  `,
  styles: `
    .wl__prompt {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-3) var(--spacing-4);
      margin-bottom: var(--spacing-4);
      padding: var(--spacing-4);
      border: 1px solid color-mix(in srgb, var(--color-warning) 45%, var(--color-border));
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--color-warning) 10%, var(--color-surface));
    }
    .wl__prompt-icon {
      flex: 0 0 auto;
      color: var(--color-warning);
    }
    .wl__prompt-text {
      flex: 1 1 320px;
      min-width: 0;
    }
    .wl__prompt-title {
      margin: 0;
      font-weight: var(--font-weight-semibold);
    }
    .wl__prompt-body {
      margin: 2px 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .wl__visibility {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-4);
      margin-bottom: var(--spacing-5);
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .wl__visibility-text {
      min-width: 0;
    }
    .wl__visibility-title {
      margin: 0;
      font-family: var(--font-body);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
    }
    .wl__visibility-help {
      margin: 2px 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .wl__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));
      gap: var(--spacing-4);
      margin: var(--spacing-4) 0 0;
      padding: 0;
      list-style: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishlistPageComponent {
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(WishlistStore);
  protected readonly actions = inject(WishlistActions);

  protected readonly bones = [1, 2, 3];
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        untracked(() => this.store.init());
      }
    });
  }

  protected get returnUrl(): string {
    return this.router.url;
  }

  protected async add(): Promise<void> {
    const item = await this.actions.add({}, false);
    if (item) {
      this.store.upsert(item);
      this.snackBar.open(addedMessage(item), 'OK', { duration: 6000 });
    }
  }

  protected async edit(item: WishlistItemResponse): Promise<void> {
    const saved = await this.actions.edit(item);
    if (saved) {
      this.store.upsert(saved);
      this.snackBar.open('Wish updated.', 'OK', { duration: 4000 });
    }
  }

  protected async remove(item: WishlistItemResponse): Promise<void> {
    const name = item.card?.name ?? 'this card';
    const copy = whichCopyLabel(item.printing, item.rarity);
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: `Remove ${name}?`,
            message: `The wish for ${copy} is removed. You can add the card again later.`,
            confirmLabel: 'Remove',
            tone: 'danger',
          },
          panelClass: 'app-dialog--md',
          autoFocus: 'first-tabbable',
          restoreFocus: true,
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }
    try {
      await this.store.remove(item);
      this.snackBar.open(`${name} (${copy}) removed from your wishlist.`, 'OK', {
        duration: 4000,
      });
    } catch (error) {
      this.snackBar.open(friendlyMessage(error as ApiError), 'OK', { duration: 6000 });
    }
  }

  protected async setVisible(event: MatSlideToggleChange): Promise<void> {
    try {
      await this.store.setVisible(event.checked);
      this.snackBar.open(
        event.checked
          ? 'Others can now see what you want on your profile.'
          : 'Your wishlist is hidden from others.',
        'OK',
        { duration: 4000 },
      );
    } catch (error) {
      event.source.checked = !event.checked;
      this.snackBar.open(friendlyMessage(error as ApiError), 'OK', { duration: 6000 });
    }
  }
}
