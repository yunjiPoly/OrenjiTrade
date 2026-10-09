import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminWishlistService, WishlistSettingsResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

/** A price term label: a percent (1-200) and "% TCG", with an optional "+". */
export const PRICE_TERM = /^([1-9]\d{0,2})% TCG(\+)?$/;
export const MAX_TERMS = 10;

/** The terms of a comma- or line-separated text, trimmed, duplicates dropped, order kept. */
export function parseTerms(text: string): string[] {
  const terms: string[] = [];
  for (const part of text.split(/[\n,]/)) {
    const term = part.trim();
    if (term && !terms.includes(term)) {
      terms.push(term);
    }
  }
  return terms;
}

/** The first invalid term, or a count problem; `null` when the list can be saved. */
export function termsProblem(terms: readonly string[]): string | null {
  for (const term of terms) {
    const match = PRICE_TERM.exec(term);
    if (!match || Number(match[1]) > 200) {
      return `"${term}" is not a term like "85% TCG" or "100% TCG+" (percent 1-200).`;
    }
  }
  if (terms.length === 0 || terms.length > MAX_TERMS) {
    return `Keep between 1 and ${MAX_TERMS} terms.`;
  }
  return null;
}

/**
 * `/admin/wishlist` (ADMIN, SUPER_ADMIN): the price terms a wish may show (platform setting
 * `wishlist.price_terms`, ADR 0014; `PUT /admin/wishlist/settings`, audited
 * `wishlist.settings.update`). Terms are display terms for sellers, relative to the TCG market
 * price, never a filter; wishes that chose a removed term keep it.
 */
@Component({
  selector: 'app-admin-wishlist-settings-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Wishlist"
        subtitle="The price terms a wish may show, relative to the TCG market price."
      />
      @if (error(); as error) {
        <app-error-state
          title="Wishlist settings could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          (retry)="load()"
        />
      } @else if (settings(); as current) {
        <section class="admin-card" aria-labelledby="wishlist-terms">
          <h2 id="wishlist-terms">Price terms</h2>
          <p class="admin-count">
            One per line, in display order, like "85% TCG" or "100% TCG+" ("+" means "or more").
            Collectors choose at most one per wish; sellers see it with the approximate amount. It
            never filters anything.
          </p>
          <mat-form-field appearance="outline" class="terms__field">
            <mat-label>Terms</mat-label>
            <textarea
              matInput
              rows="6"
              data-testid="admin-price-terms"
              [value]="text()"
              (input)="text.set($any($event.target).value)"
            ></textarea>
            @if (problem(); as problem) {
              <mat-hint class="terms__problem">{{ problem }}</mat-hint>
            } @else {
              <mat-hint>{{ terms().length }} terms</mat-hint>
            }
          </mat-form-field>
          <div class="terms__actions">
            <button
              matButton="filled"
              type="button"
              [disabled]="saving() || !!problem() || !changed()"
              (click)="save()"
            >
              Save terms
            </button>
            <button matButton type="button" [disabled]="saving() || !changed()" (click)="reset()">
              Discard changes
            </button>
          </div>
        </section>
      } @else {
        <div aria-busy="true">
          <span class="visually-hidden">Loading the wishlist settings</span>
          <app-skeleton variant="list" lines="4" />
        </div>
      }
    </div>
  `,
  styles: `
    .terms__field {
      width: 100%;
      max-width: 420px;
    }
    .terms__problem {
      color: var(--color-danger);
    }
    .terms__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
      margin-top: var(--spacing-3);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminWishlistSettingsPageComponent {
  private readonly api = inject(AdminWishlistService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly settings = signal<WishlistSettingsResponse | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly saving = signal(false);
  protected readonly text = signal('');
  protected readonly terms = computed(() => parseTerms(this.text()));
  protected readonly problem = computed(() => termsProblem(this.terms()));
  protected readonly changed = computed(
    () => this.terms().join('\n') !== (this.settings()?.priceTerms ?? []).join('\n'),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      const settings = await firstValueFrom(
        this.api.getAdminWishlistSettings('body', false, { context: silentErrors() }),
      );
      this.apply(settings);
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }

  protected reset(): void {
    this.text.set((this.settings()?.priceTerms ?? []).join('\n'));
  }

  protected async save(): Promise<void> {
    if (this.problem() || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.updateAdminWishlistSettings(
          { updateWishlistSettingsRequest: { priceTerms: this.terms() } },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.apply(saved);
      this.snackBar.open('Price terms saved.', 'OK', { duration: 3000 });
    } catch (error) {
      this.snackBar.open(friendlyMessage(toApiError(error)), 'OK', { duration: 6000 });
    } finally {
      this.saving.set(false);
    }
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  private apply(settings: WishlistSettingsResponse): void {
    this.settings.set(settings);
    this.text.set((settings.priceTerms ?? []).join('\n'));
  }
}
