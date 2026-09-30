import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
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
import { WishFilter, WishlistStore } from './data/wishlist.store';
import { MatchReadinessComponent } from './list/match-readiness.component';
import { WishCardComponent } from './list/wish-card.component';
import { WishlistSummaryComponent } from './list/wishlist-summary.component';
import {
  MatchesSheetData,
  MatchesSheetResult,
  WishlistMatchesSheetComponent,
} from './matches/wishlist-matches-sheet.component';

/**
 * `/wishlist` and `/wishlist/:id`: the collector's wishes (card art, printing or "any printing",
 * criteria chips, match count, alerts switch, edit and remove), the add/edit dialog (card
 * autocomplete → optional printing → criteria) and, for `/wishlist/:id` (the deep link of
 * WISHLIST_MATCH notifications), the matches drawer of that wish. Match counts stay live over the
 * realtime channel.
 */
@Component({
  selector: 'app-wishlist-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
    MatchReadinessComponent,
    WishCardComponent,
    WishlistSummaryComponent,
  ],
  providers: [WishlistStore],
  template: `
    <div class="page wl">
      @if (auth.isAuthenticated()) {
        <app-page-header
          title="Wishlist"
          subtitle="Cards you are hunting for. We tell you when a collector nearby lists one."
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

        <app-match-readiness [readiness]="store.readiness()" />

        @switch (store.status()) {
          @case ('loading') {
            <div class="wl__grid" aria-busy="true">
              <span class="visually-hidden">Loading your wishlist</span>
              @for (bone of bones; track bone) {
                <app-skeleton height="190px" />
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
              <app-wishlist-summary
                [count]="store.counts().all"
                [matched]="store.counts().matches"
                [totalMatches]="store.totalMatches()"
                [usage]="store.usage()"
              />
              <div class="wl__bar">
                <mat-button-toggle-group
                  aria-label="Show wishes"
                  hideSingleSelectionIndicator
                  [value]="store.filter()"
                  (change)="onFilter($event)"
                >
                  <mat-button-toggle value="all">All ({{ store.counts().all }})</mat-button-toggle>
                  <mat-button-toggle value="matches">
                    With matches ({{ store.counts().matches }})
                  </mat-button-toggle>
                  <mat-button-toggle value="paused">
                    Paused ({{ store.counts().paused }})
                  </mat-button-toggle>
                </mat-button-toggle-group>
              </div>
              @if (store.visible().length) {
                <ul class="wl__grid" aria-label="Your wishlist">
                  @for (item of store.visible(); track item.id) {
                    <li>
                      <app-wish-card
                        [item]="item"
                        [busy]="store.busy().has(item.id)"
                        (openMatches)="showMatches(item)"
                        (edit)="edit(item)"
                        (remove)="remove(item)"
                        (activeChange)="setActive(item, $event)"
                      />
                    </li>
                  }
                </ul>
              } @else {
                <app-empty-state
                  [icon]="store.filter() === 'paused' ? 'notifications_paused' : 'travel_explore'"
                  [title]="
                    store.filter() === 'paused' ? 'No paused wishes' : 'No matches nearby yet'
                  "
                  [description]="
                    store.filter() === 'paused'
                      ? 'Every wish has its alerts on.'
                      : 'When a collector near you lists a card you want, it shows up here.'
                  "
                >
                  <button
                    actions
                    matButton="outlined"
                    type="button"
                    (click)="store.setFilter('all')"
                  >
                    Show all wishes
                  </button>
                </app-empty-state>
              }
            } @else {
              <app-empty-state
                icon="favorite"
                title="Your wishlist is empty"
                description="Add the cards you are hunting for. We'll let you know as soon as a collector nearby lists one."
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
          description="Sign in to keep a wishlist and hear when a collector nearby lists a card you want."
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
    .wl__bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-3);
      margin: var(--spacing-5) 0 var(--spacing-4);
    }
    .wl__bar mat-button-toggle-group {
      max-width: 100%;
      overflow-x: auto;
    }
    .wl__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));
      gap: var(--spacing-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishlistPageComponent {
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(WishlistStore);
  protected readonly actions = inject(WishlistActions);

  /** `/wishlist/:id`: the wish whose matches drawer is open (bound by the router). */
  readonly id = input<string | undefined>();

  protected readonly bones = [1, 2, 3];
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });

  private sheet: { id: string; ref: MatDialogRef<WishlistMatchesSheetComponent> } | null = null;
  private destroyed = false;

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        untracked(() => this.store.init());
      }
    });
    // The URL drives the drawer: `/wishlist/<id>` opens it once the list is known.
    effect(() => {
      const id = this.id() ?? null;
      const ready = this.store.status() === 'ready';
      untracked(() => this.syncSheet(id, ready));
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      // A drawer still open when the page goes away (browser navigation) closes with it; one
      // already closing keeps its own result.
      this.sheet?.ref.close({ navigated: true, changed: false });
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
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: `Remove ${name}?`,
            message: 'The wish and its matches are removed. You can add the card again later.',
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
      this.snackBar.open(`${name} removed from your wishlist.`, 'OK', { duration: 4000 });
    } catch (error) {
      this.snackBar.open(friendlyMessage(error as ApiError), 'OK', { duration: 6000 });
    }
  }

  protected async setActive(item: WishlistItemResponse, active: boolean): Promise<void> {
    try {
      await this.store.setActive(item, active);
      this.snackBar.open(
        active
          ? `Alerts on for ${item.card?.name ?? 'this wish'}.`
          : `Alerts paused for ${item.card?.name ?? 'this wish'}.`,
        'OK',
        { duration: 3000 },
      );
    } catch (error) {
      this.snackBar.open(friendlyMessage(error as ApiError), 'OK', { duration: 6000 });
    }
  }

  protected showMatches(item: WishlistItemResponse): void {
    void this.router.navigate(['/wishlist', item.id]);
  }

  protected onFilter(event: MatButtonToggleChange): void {
    this.store.setFilter(event.value as WishFilter);
  }

  private syncSheet(id: string | null, ready: boolean): void {
    if (!id) {
      this.sheet?.ref.close();
      return;
    }
    if (!ready || this.sheet?.id === id) {
      return;
    }
    const item = this.store.find(id);
    if (!item) {
      this.snackBar.open('This wish is no longer on your wishlist.', 'OK', { duration: 5000 });
      void this.router.navigate(['/wishlist'], { replaceUrl: true });
      return;
    }
    this.sheet?.ref.close();
    const ref = this.dialog.open<
      WishlistMatchesSheetComponent,
      MatchesSheetData,
      MatchesSheetResult
    >(WishlistMatchesSheetComponent, {
      data: { item },
      injector: this.injector,
      panelClass: 'app-side-sheet',
      position: { right: '0', top: '0' },
      height: '100dvh',
      maxHeight: '100dvh',
      width: 'min(560px, 100vw)',
      maxWidth: '100vw',
      autoFocus: 'dialog',
      restoreFocus: true,
    });
    this.sheet = { id, ref };
    ref.beforeClosed().subscribe(() => {
      if (this.sheet?.ref === ref) {
        this.sheet = null;
      }
    });
    ref.afterClosed().subscribe((result) => {
      if (this.destroyed) {
        return;
      }
      void this.store.refresh();
      if (!result?.navigated && this.id() === id) {
        void this.router.navigate(['/wishlist'], { replaceUrl: true });
      }
    });
  }
}
