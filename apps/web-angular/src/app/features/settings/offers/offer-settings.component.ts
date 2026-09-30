import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { OffersService } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/ui/section-card/section-card.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; error: ApiError };

/**
 * Settings → Offers (`GET/PUT /me/settings/offers`): whether mixed offers (cash + cards) are
 * welcome on the collector's "trade or sale" cards. Saved on change; a failure restores the
 * previous value. Offers on a card are switched on or off per card in the inventory.
 */
@Component({
  selector: 'app-offer-settings',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    ErrorStateComponent,
    SectionCardComponent,
    SkeletonComponent,
  ],
  template: `
    <app-section-card
      heading="Offers"
      headingId="offer-settings-heading"
      description="Choose which offers collectors can make on your cards."
    >
      @switch (state().kind) {
        @case ('loading') {
          <div aria-busy="true">
            <span class="visually-hidden">Loading your offer settings</span>
            <app-skeleton variant="list" lines="2" />
          </div>
        }
        @case ('error') {
          <app-error-state
            compact
            title="Your offer settings could not load"
            [message]="errorMessage()"
            (retry)="load()"
          />
        }
        @default {
          <div class="setting">
            <mat-slide-toggle
              [checked]="acceptsMixed()"
              [disabled]="saving()"
              (change)="toggle($event)"
              aria-describedby="accepts-mixed-help"
            >
              Accept mixed offers (cash + cards)
            </mat-slide-toggle>
            <p id="accepts-mixed-help" class="setting__help">
              On cards offered for trade or sale, collectors can offer an amount together with some
              of their cards. Negotiations already open continue either way.
            </p>
          </div>
          <p class="section-status" aria-live="polite">
            @if (saving()) {
              Saving…
            } @else if (saved()) {
              <mat-icon aria-hidden="true">check</mat-icon> Saved
            }
          </p>
          <div class="section-callout">
            <mat-icon aria-hidden="true">tips_and_updates</mat-icon>
            <p>
              Cash and trade offers follow each card's availability and its “Accepts offers” switch,
              which you set per card in your
              <a routerLink="/inventory">inventory</a>.
            </p>
          </div>
        }
      }
    </app-section-card>
  `,
  styleUrls: ['../settings-section.scss'],
  styles: `
    .setting {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
    }
    .setting__help {
      margin: 0 0 0 52px;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .section-status {
      min-height: 20px;
      margin: var(--spacing-2) 0 var(--spacing-4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferSettingsComponent {
  private readonly api = inject(OffersService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly state = signal<LoadState>({ kind: 'loading' });
  protected readonly acceptsMixed = signal(true);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly errorMessage = signal('');

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set({ kind: 'loading' });
    try {
      const settings = await firstValueFrom(
        this.api.getOfferSettings('body', false, { context: silentErrors() }),
      );
      this.acceptsMixed.set(settings.acceptsMixed);
      this.state.set({ kind: 'ready' });
    } catch (error) {
      const apiError = toApiError(error);
      this.errorMessage.set(friendlyMessage(apiError));
      this.state.set({ kind: 'error', error: apiError });
    }
  }

  protected async toggle(event: MatSlideToggleChange): Promise<void> {
    const previous = this.acceptsMixed();
    this.acceptsMixed.set(event.checked);
    this.saving.set(true);
    this.saved.set(false);
    try {
      const settings = await firstValueFrom(
        this.api.updateOfferSettings(
          { updateOfferSettingsRequest: { acceptsMixed: event.checked } },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.acceptsMixed.set(settings.acceptsMixed);
      this.saved.set(true);
    } catch (error) {
      this.acceptsMixed.set(previous);
      event.source.checked = previous;
      this.snackBar.open(`Not saved. ${friendlyMessage(toApiError(error))}`, 'OK', {
        duration: 6000,
      });
    } finally {
      this.saving.set(false);
    }
  }
}
