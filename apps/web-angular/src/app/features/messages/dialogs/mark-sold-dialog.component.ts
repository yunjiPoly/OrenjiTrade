import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ConversationSubject, DealsService, SaleResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { QuantityStepperComponent } from '../../../shared/ui/quantity-stepper/quantity-stepper.component';
import { MARK_SOLD_COPY } from '../data/chat-copy';
import { TRACKING_MAX, cleanTracking, markSoldSentence, trackingProblem } from '../data/deal-rules';
import { saleErrorMessage } from '../data/sale-errors';

export interface MarkSoldData {
  conversationId: string;
  subject: ConversationSubject;
  /** The buyer's handle. */
  buyer: string;
}

/** The dialog's answer: the sale, or the buyer pinned another listing meanwhile. */
export type MarkSoldResult = { sale: SaleResponse } | { changed: true; message: string };

/**
 * Mark as sold (480, spec 10.5, board W19): the card row (42×60 art, name, mono code) with
 * "Copies sold" − 1 + up to the copies held (a deck core sells as one), "Tracking number ·
 * optional" (mono; the API's rule checked as typed), one live sentence, [Mark as sold] and [Not
 * yet]. `POST /conversations/{id}/sales` with the subject shown, so a listing the buyer pinned
 * since answers 409 SUBJECT_CHANGED and nothing is sold. Refusals stay in the dialog. The tracking
 * number is sent once and never logged or kept here.
 */
@Component({
  selector: 'app-mark-sold-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    CardImageComponent,
    QuantityStepperComponent,
  ],
  template: `
    @let s = data.subject;
    <div class="ms">
      <header class="ms__head">
        <h2 class="ms__title" mat-dialog-title>{{ copy.title }}</h2>
        <button type="button" class="ms__close" [attr.aria-label]="copy.close" mat-dialog-close>
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </header>

      <div class="ms__card">
        <app-card-image class="ms__art" size="fill" [src]="s.imageUrl" alt="" />
        <span class="ms__names">
          <span class="ms__name">{{ s.name }}</span>
          <span class="ms__code mono">{{ codeLine }}</span>
        </span>
        @if (isCard) {
          <span class="ms__copies">
            <span class="ms__copies-label" id="ms-copies">{{ copy.copiesSold }}</span>
            <app-quantity-stepper
              [label]="s.name"
              [value]="quantity()"
              [min]="1"
              [max]="held"
              [disabled]="saving() || held <= 1"
              (valueChange)="quantity.set($event)"
            />
            <span class="ms__of">{{ copy.of(held) }}</span>
          </span>
        }
      </div>

      <label class="ms__field">
        <span class="ms__label"
          >{{ copy.trackingLabel }} <span class="ms__optional">· {{ copy.optional }}</span></span
        >
        <span class="ms__input">
          <mat-icon aria-hidden="true">package_2</mat-icon>
          <input
            class="mono"
            type="text"
            cdkFocusInitial
            autocomplete="off"
            spellcheck="false"
            data-testid="tracking-input"
            [attr.maxlength]="trackingMax + 16"
            [attr.aria-invalid]="problem() ? 'true' : null"
            [attr.aria-describedby]="problem() ? 'ms-problem' : 'ms-hint'"
            [placeholder]="copy.trackingPlaceholder(data.buyer)"
            [value]="tracking()"
            (input)="onTracking($event)"
            (keydown.enter)="confirm($event)"
          />
          @if (tracking()) {
            <button
              type="button"
              class="ms__clear"
              [attr.aria-label]="copy.clearTracking"
              (click)="tracking.set('')"
            >
              <mat-icon aria-hidden="true">close</mat-icon>
            </button>
          }
        </span>
        @if (problem(); as problem) {
          <span class="ms__problem" id="ms-problem">{{ problem }}</span>
        } @else {
          <span class="ms__hint" id="ms-hint">{{ copy.trackingHint(data.buyer) }}</span>
        }
      </label>

      <p class="ms__sentence" aria-live="polite" data-testid="mark-sold-sentence">
        <mat-icon aria-hidden="true">info</mat-icon>
        <span>{{ sentence() }}</span>
      </p>

      @if (error(); as error) {
        <p class="ms__error" role="alert" data-testid="mark-sold-error">{{ error }}</p>
      }

      <div class="ms__actions">
        <button matButton="outlined" class="ms__btn" type="button" mat-dialog-close>
          {{ copy.notYet }}
        </button>
        <button
          matButton="filled"
          class="ms__btn ms__btn--primary"
          type="button"
          [disabled]="saving() || !!problem()"
          (click)="confirm()"
        >
          {{ saving() ? copy.saving : copy.confirm }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .ms {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
      padding: var(--spacing-6);
    }
    .ms__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ms__title {
      margin: 0;
      padding: 0;
      font-family: var(--font-display);
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
    }
    .ms__title::before {
      display: none;
    }
    .ms__close,
    .ms__clear {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--color-ink);
      cursor: pointer;
    }
    .ms__clear {
      width: 28px;
      height: 28px;
      color: var(--color-text-muted);
    }
    .ms__close:focus-visible,
    .ms__clear:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
    }
    .ms__card {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-row);
      background: var(--color-surface-variant);
    }
    .ms__art {
      flex: 0 0 42px;
      width: 42px;
    }
    .ms__names {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
    }
    .ms__name {
      font-weight: var(--font-weight-semibold);
    }
    .ms__code {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .ms__copies {
      display: flex;
      flex: 0 0 auto;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .ms__copies-label,
    .ms__of {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .ms__copies-label {
      font-weight: var(--font-weight-semibold);
    }
    .ms__field {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
    }
    .ms__label {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .ms__optional {
      color: var(--color-text-muted);
      font-weight: var(--font-weight-regular);
    }
    .ms__input {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      height: 48px;
      padding: 0 var(--spacing-2) 0 var(--spacing-3);
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-input);
      background: var(--color-surface);
      color: var(--color-text-muted);
    }
    .ms__input:focus-within {
      border-color: var(--color-primary);
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 1px;
    }
    .ms__input input {
      flex: 1 1 auto;
      min-width: 0;
      border: 0;
      background: none;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      outline: none;
    }
    .ms__hint {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .ms__problem,
    .ms__error {
      margin: 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    .ms__sentence {
      display: flex;
      gap: var(--spacing-2);
      margin: 0;
      padding: var(--spacing-3) var(--spacing-4);
      border: 1px solid var(--color-chat-sale-border);
      border-radius: var(--radius-row);
      background: var(--color-chat-sale-surface);
      color: var(--color-chat-sale-text);
      font-size: var(--font-size-sm);
    }
    .ms__sentence mat-icon {
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      color: var(--color-chat-sale-label);
      font-size: 18px;
    }
    .ms__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--spacing-3);
    }
    .ms__btn {
      min-width: 104px;
    }
    .ms__btn--primary {
      min-width: 156px;
      height: 52px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkSoldDialogComponent {
  protected readonly data = inject<MarkSoldData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<MarkSoldDialogComponent, MarkSoldResult>>(MatDialogRef);
  private readonly deals = inject(DealsService);

  protected readonly copy = MARK_SOLD_COPY;
  protected readonly trackingMax = TRACKING_MAX;
  protected readonly isCard = this.data.subject.kind === 'CARD';
  protected readonly held = Math.max(1, this.data.subject.copies ?? 1);
  protected readonly codeLine = this.isCard
    ? [this.data.subject.printingCode, this.data.subject.rarity].filter(Boolean).join(' · ')
    : 'Deck core';

  protected readonly quantity = signal(1);
  protected readonly tracking = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly problem = computed(() => trackingProblem(this.tracking()));
  protected readonly sentence = computed(() =>
    markSoldSentence(this.data.subject, this.quantity(), this.data.buyer),
  );

  protected onTracking(event: Event): void {
    this.tracking.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected async confirm(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.saving() || this.problem()) {
      return;
    }
    const subject = this.data.subject;
    const tracking = cleanTracking(this.tracking());
    this.saving.set(true);
    this.error.set(null);
    try {
      const sale = await firstValueFrom(
        this.deals.markSold(
          {
            id: this.data.conversationId,
            markSoldRequest: {
              quantity: this.isCard ? this.quantity() : 1,
              ...(tracking ? { trackingNumber: tracking } : {}),
              ...(this.isCard ? { subjectItemId: subject.id } : { subjectBinderId: subject.id }),
            },
          },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.ref.close({ sale });
    } catch (error) {
      const apiError = toApiError(error);
      const message = saleErrorMessage(apiError, this.data.buyer);
      if (apiError.errorCode === 'SUBJECT_CHANGED') {
        this.ref.close({ changed: true, message });
        return;
      }
      this.error.set(message);
    } finally {
      this.saving.set(false);
    }
  }
}
