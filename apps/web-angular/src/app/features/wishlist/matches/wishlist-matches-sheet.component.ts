import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import type { WishlistItemResponse, WishlistMatchResponse } from '@orenji/api-client';
import { ApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { CardImageComponent } from '../../../shared/catalog/card-image/card-image.component';
import { printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { ConversationStarterService } from '../../../shared/messaging/conversation-starter.service';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import {
  matchCountLabel,
  wishCriteriaChips,
  wishPrintingLabel,
} from '../../../shared/wishlist/wishlist-labels';
import { WishlistMatchesStore } from '../data/wishlist-matches.store';
import { WishMatchCardComponent } from './wish-match-card.component';

export interface MatchesSheetData {
  item: WishlistItemResponse;
}

/** How the drawer closed: after following a link (no need to go back to `/wishlist`). */
export interface MatchesSheetResult {
  navigated: boolean;
  /** Matches were dismissed or arrived: the wish's count changed. */
  changed: boolean;
}

/**
 * The matches drawer of one wish (a side sheet): who near you lists the card, newest first, with
 * each collector's approximate place and distance bucket, the listing and Message / View binder /
 * On the map / Dismiss. Cursor pages ("Load more"); new matches arrive live.
 */
@Component({
  selector: 'app-wishlist-matches-sheet',
  imports: [
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    CardImageComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
    WishMatchCardComponent,
  ],
  providers: [WishlistMatchesStore],
  template: `
    <div class="ms">
      <header class="ms__head">
        <app-card-image class="ms__img" [src]="image()" [alt]="name()" [game]="item.game" />
        <div class="ms__titles">
          <p class="ms__eyebrow">Matches nearby</p>
          <h2 mat-dialog-title class="ms__title">Matches for {{ name() }}</h2>
          <p class="ms__sub">{{ printing() }} · {{ criteria() }}</p>
        </div>
        <button matIconButton type="button" aria-label="Close matches" (click)="close(false)">
          <mat-icon>close</mat-icon>
        </button>
      </header>

      <mat-dialog-content class="ms__body" [attr.aria-busy]="store.status() === 'loading'">
        @switch (store.status()) {
          @case ('loading') {
            <span class="visually-hidden">Loading matches</span>
            <app-skeleton height="180px" />
            <app-skeleton height="180px" />
          }
          @case ('error') {
            <app-error-state
              compact
              title="Matches could not load"
              [message]="errorMessage()"
              [requestId]="store.error()?.requestId ?? null"
              (retry)="store.load()"
            />
          }
          @default {
            @if (store.matches().length) {
              <p class="ms__count" aria-live="polite">{{ countLabel() }}</p>
              <ul class="ms__list" aria-label="Matches">
                @for (match of store.matches(); track match.id) {
                  <li>
                    <app-wish-match-card
                      [match]="match"
                      [messaging]="starter.starting() === match.collector.id"
                      [dismissing]="store.dismissing().has(match.id)"
                      (messageRequested)="message(match)"
                      (dismiss)="dismiss(match)"
                      (navigate)="close(true)"
                    />
                  </li>
                }
              </ul>
              @if (store.hasMore()) {
                <div class="ms__more">
                  @if (store.moreFailed()) {
                    <p class="ms__muted" role="alert">More matches could not load.</p>
                  }
                  <button
                    matButton="outlined"
                    type="button"
                    [disabled]="store.loadingMore()"
                    (click)="store.loadMore()"
                  >
                    {{ store.loadingMore() ? 'Loading…' : 'Load more matches' }}
                  </button>
                </div>
              }
            } @else {
              <app-empty-state
                icon="travel_explore"
                title="No matches yet"
                [description]="emptyText()"
              >
                <a
                  actions
                  matButton="outlined"
                  routerLink="/map"
                  [queryParams]="mapQuery()"
                  (click)="close(true)"
                >
                  <mat-icon aria-hidden="true">map</mat-icon>
                  Who has it on the map
                </a>
              </app-empty-state>
            }
          }
        }
      </mat-dialog-content>

      <p class="ms__privacy">
        <mat-icon aria-hidden="true">shield_person</mat-icon>
        Places and distances are approximate to protect privacy.
      </p>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .ms {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--color-background);
    }
    .ms__head {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-4) var(--spacing-3) var(--spacing-3) var(--spacing-5);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
    }
    .ms__img {
      flex: 0 0 52px;
      width: 52px;
    }
    .ms__titles {
      flex: 1 1 auto;
      min-width: 0;
    }
    .ms__eyebrow {
      margin: 0;
      color: var(--color-primary);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .ms__title {
      margin: 0;
      padding: 0;
      font-size: var(--font-size-xl);
      line-height: 1.25;
    }
    .ms__title::before {
      display: none;
    }
    .ms__sub {
      margin: 2px 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .ms__body.mat-mdc-dialog-content {
      flex: 1 1 auto;
      max-height: none;
      padding: var(--spacing-4) var(--spacing-5);
    }
    .ms__count {
      margin: 0 0 var(--spacing-3);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
    }
    .ms__list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .ms__more {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--spacing-2);
      margin-top: var(--spacing-4);
    }
    .ms__muted {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .ms__privacy {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      margin: 0;
      padding: var(--spacing-2) var(--spacing-5);
      border-top: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .ms__privacy mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
      color: var(--color-accent);
    }
    @media (max-width: 599px) {
      .ms__head {
        padding-left: var(--spacing-4);
      }
      .ms__body.mat-mdc-dialog-content {
        padding: var(--spacing-3);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishlistMatchesSheetComponent {
  private readonly dialogRef =
    inject<MatDialogRef<WishlistMatchesSheetComponent, MatchesSheetResult>>(MatDialogRef);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly starter = inject(ConversationStarterService);
  protected readonly store = inject(WishlistMatchesStore);
  protected readonly item = inject<MatchesSheetData>(MAT_DIALOG_DATA).item;

  protected readonly name = computed(() => this.item.card?.name ?? 'this card');
  protected readonly image = computed(
    () => printingImageUrl(this.item.printing) ?? this.item.card?.imageUrl ?? null,
  );
  protected readonly printing = computed(() => wishPrintingLabel(this.item.printing));
  protected readonly criteria = computed(() =>
    wishCriteriaChips(this.item)
      .filter((chip) => chip.kind !== 'trade')
      .map((chip) => chip.label)
      .join(' · '),
  );
  protected readonly countLabel = computed(
    () => `${matchCountLabel(this.store.matches().length)}${this.store.hasMore() ? ' so far' : ''}`,
  );
  protected readonly emptyText = computed(() =>
    this.item.active
      ? `We'll notify you as soon as a collector within ${this.item.radiusKm} km lists it.`
      : 'Alerts are paused for this wish: turn them back on to match new listings.',
  );
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly mapQuery = computed(() =>
    this.item.printing?.id
      ? { printing: this.item.printing.id, view: 'list' }
      : { card: this.item.card?.id ?? null, view: 'list' },
  );

  constructor() {
    this.store.init(this.item.id);
  }

  protected close(navigated: boolean): void {
    this.dialogRef.close({ navigated, changed: this.store.changed() });
  }

  /** Opens (or starts) the conversation with the collector on the Messages page. */
  protected async message(match: WishlistMatchResponse): Promise<void> {
    const conversation = await this.starter.start(match.collector.id);
    if (conversation) {
      this.close(true);
      void this.router.navigate(['/messages', conversation.id]);
    }
  }

  protected async dismiss(match: WishlistMatchResponse): Promise<void> {
    try {
      await this.store.dismiss(match);
      this.snackBar.open(`Match from ${match.collector.displayName} dismissed.`, 'OK', {
        duration: 4000,
      });
    } catch (error) {
      this.snackBar.open(friendlyMessage(error as ApiError), 'OK', { duration: 6000 });
    }
  }
}
