import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { OfferResponse, OffersService } from '@orenji/api-client';
import { firstValueFrom, startWith } from 'rxjs';
import { FEATURE, FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { toApiError } from '../../core/http/api-error';
import { newRequestId, silentErrors } from '../../core/http/http-context';
import { CardImageComponent } from '../ui/card-image/card-image.component';
import { CURRENCIES, formatPrice } from '../inventory/inventory-labels';
import { ItemChipsComponent } from '../inventory/item-chips/item-chips.component';
import { ProtectionExplainerComponent } from '../payments/protection-explainer.component';
import { AvatarComponent } from '../ui/avatar/avatar.component';
import { OfferCardPickerComponent } from './offer-card-picker.component';
import {
  OfferForm,
  OfferFormValue,
  TradeLine,
  cardsError,
  cashError,
  counterValue,
  createOfferForm,
  newOfferValue,
  sameDeal,
  toCounterRequest,
  toCreateRequest,
  tradeLineFromOffer,
} from './offer-form';
import {
  OFFER_EXPIRY_OPTIONS,
  OFFER_KIND_INFO,
  OFFER_MESSAGE_MAX,
  OfferKind,
  OfferRole,
  allowedOfferKinds,
  kindHasCards,
  kindHasCash,
  offerTermsText,
} from './offer-labels';
import { OfferProblem, offerProblem } from './offer-problems';
import { OfferTarget } from './offer-target';

export interface MakeOfferDialogData {
  target: OfferTarget;
  /** Counter-offer mode: the live proposal being answered and the caller's side. */
  counter?: { offer: OfferResponse; viewerRole: OfferRole; otherName: string };
}

/** How the dialog closed: the new proposal, or a refusal that needs the page to re-read. */
export type MakeOfferResult = { offer: OfferResponse } | { problem: OfferProblem };

type FieldName = 'cashAmount' | 'cards' | 'message' | 'expiresInHours';

/**
 * "Make an offer" (and "Counter-offer") dialog: the card and its seller, the kind (cash, trade,
 * or cash + cards, only those the card's availability and `acceptsOffers` allow), the amount, the
 * cards from the caller's own inventory with copies, a note ≤ 500 and the expiry. A new offer is
 * sent with `POST /offers` and an `Idempotency-Key` fixed for the dialog (a double submit or a
 * retry repeats the original answer); a counter-offer with `POST /offers/{id}/counter` and the
 * version the caller saw. Refusals are explained inline (422 not accepted, 409 already open with
 * a link to that offer, 404, 403, 400 fields); a counter-offer refused because the offer changed
 * closes the dialog so the page can show the latest version. 429 LIMIT_REACHED also opens the
 * global limit dialog.
 */
@Component({
  selector: 'app-make-offer-dialog',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    AvatarComponent,
    CardImageComponent,
    ItemChipsComponent,
    OfferCardPickerComponent,
    ProtectionExplainerComponent,
  ],
  template: `
    @let t = data.target;
    <h2 mat-dialog-title>{{ counter ? 'Counter-offer' : 'Make an offer' }}</h2>
    <form [formGroup]="form" (submit)="submit($event)" novalidate>
      <mat-dialog-content>
        <section class="target" aria-label="The card">
          <app-card-image
            class="target__img"
            [src]="t.imageUrl"
            [game]="t.game"
            [alt]="t.cardName"
          />
          <div class="target__body">
            <p class="target__name">{{ t.cardName }}</p>
            <p class="target__meta">
              @if (t.printingCode) {
                <span class="mono">{{ t.printingCode }}</span>
              }
              @if (t.setName) {
                · {{ t.setName }}
              }
            </p>
            <app-item-chips
              [condition]="t.condition"
              [availability]="t.availability"
              [acceptsOffers]="t.acceptsOffers"
            />
            <p class="target__price">
              @if (askingPrice(); as price) {
                Asking <strong>{{ price }}</strong>
              } @else {
                No asking price
              }
            </p>
            <div class="target__seller">
              <app-avatar
                size="xs"
                [src]="t.seller.avatarUrl"
                [name]="t.seller.displayName"
                [decorative]="true"
              />
              <span>
                {{ t.seller.displayName }}
                @if (t.seller.placeLabel) {
                  <span class="target__place">· {{ t.seller.placeLabel }}</span>
                }
              </span>
            </div>
          </div>
        </section>

        @if (counter; as c) {
          <p class="current" data-testid="current-proposal">
            <mat-icon aria-hidden="true">history</mat-icon>
            <span>
              Current proposal: <strong>{{ currentTerms() }}</strong
              >. Change the amount or the cards to answer {{ c.otherName }}.
            </span>
          </p>
        }

        @if (kinds.length === 0) {
          <p class="problem" role="alert">
            <mat-icon aria-hidden="true">block</mat-icon>
            <span>This card does not accept offers right now.</span>
          </p>
        } @else {
          <fieldset class="block">
            <legend class="block__title" [id]="ids.kind">What do you offer?</legend>
            @if (kinds.length > 1) {
              <mat-button-toggle-group
                class="kinds"
                formControlName="kind"
                [attr.aria-labelledby]="ids.kind"
                hideSingleSelectionIndicator
              >
                @for (kind of kinds; track kind) {
                  <mat-button-toggle [value]="kind">
                    <mat-icon aria-hidden="true">{{ kindInfo[kind].icon }}</mat-icon>
                    {{ kindInfo[kind].label }}
                  </mat-button-toggle>
                }
              </mat-button-toggle-group>
            } @else {
              <p class="kinds__single">
                <mat-icon aria-hidden="true">{{ kindInfo[kinds[0]].icon }}</mat-icon>
                {{ kindInfo[kinds[0]].label }} ·
                <span class="muted">{{ singleKindHint() }}</span>
              </p>
            }
          </fieldset>

          @if (hasCash()) {
            <div class="cash">
              <mat-form-field appearance="outline" class="cash__amount">
                <mat-label>Amount</mat-label>
                <input
                  matInput
                  type="number"
                  inputmode="decimal"
                  min="0.01"
                  step="0.01"
                  formControlName="cashAmount"
                  aria-required="true"
                />
                <mat-hint>{{ cashHint() }}</mat-hint>
                @if (form.controls.cashAmount.invalid) {
                  <mat-error>{{ fieldError('cashAmount') }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline" class="cash__currency">
                <mat-label>Currency</mat-label>
                <mat-select formControlName="currency">
                  @for (code of currencies; track code) {
                    <mat-option [value]="code">{{ code }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
            @if (protectionAvailable()) {
              <div class="protection" data-testid="protection-option">
                <mat-checkbox formControlName="protectionRequested">
                  Use payment protection
                </mat-checkbox>
                <p class="protection__hint">
                  The card is shipped to you with tracking and {{ t.seller.displayName }} is paid
                  only once you confirm it arrived. You can still agree to meet in person later.
                </p>
                <app-protection-explainer collapsed />
              </div>
            } @else if (counter?.offer?.protectionRequested) {
              <p class="protection__kept" data-testid="protection-kept">
                <mat-icon aria-hidden="true">verified_user</mat-icon>
                Payment protection stays on for this deal.
              </p>
            }
          }

          @if (hasCards()) {
            <fieldset class="block">
              <legend class="block__title">
                {{
                  counter && counter.viewerRole === 'SELLER'
                    ? 'Their cards in the deal'
                    : 'Your cards'
                }}
              </legend>
              <app-offer-card-picker
                [lines]="cards()"
                [mode]="pickerMode"
                [pool]="pool"
                [disabled]="submitting()"
                (linesChange)="setCards($event)"
              />
              @if (cardsTouched() && form.controls.cards.invalid) {
                <p class="field-error" role="alert" data-testid="cards-error">
                  {{ fieldError('cards') }}
                </p>
              }
            </fieldset>
          }

          <mat-form-field appearance="outline" class="wide">
            <mat-label
              >Note to
              {{ counter ? counter.otherName : t.seller.displayName }} (optional)</mat-label
            >
            <textarea
              matInput
              rows="2"
              formControlName="message"
              [attr.maxlength]="messageMax"
              placeholder="Where could you meet? Anything about the condition?"
            ></textarea>
            <mat-hint align="end">{{ messageLength() }} / {{ messageMax }}</mat-hint>
            @if (form.controls.message.invalid) {
              <mat-error>{{ fieldError('message') }}</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline" class="expiry">
            <mat-label>Offer expires in</mat-label>
            <mat-select formControlName="expiresInHours">
              @for (option of expiryOptions; track option.hours) {
                <mat-option [value]="option.hours">{{ option.label }}</mat-option>
              }
            </mat-select>
            @if (form.controls.expiresInHours.invalid) {
              <mat-error>{{ fieldError('expiresInHours') }}</mat-error>
            }
          </mat-form-field>

          <p class="summary" aria-live="polite" data-testid="offer-summary">
            <mat-icon aria-hidden="true">{{ kindInfo[kind()].icon }}</mat-icon>
            <span>
              You offer <strong>{{ termsText() }}</strong> for {{ t.cardName
              }}{{ protected() ? ' with payment protection' : '' }}.
            </span>
          </p>
        }

        @if (problem(); as p) {
          <p class="problem" role="alert" data-testid="offer-error">
            <mat-icon aria-hidden="true">error</mat-icon>
            <span>
              {{ p.message }}
              @if (p.openOfferId) {
                <a [routerLink]="['/offers', p.openOfferId]" (click)="close()"
                  >View your open offer</a
                >
              }
            </span>
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button
          matButton="filled"
          type="submit"
          [disabled]="kinds.length === 0 || submitting() || blocked()"
        >
          {{ submitLabel() }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .target {
      display: grid;
      grid-template-columns: 88px 1fr;
      gap: var(--spacing-4);
      margin-bottom: var(--spacing-4);
      padding: var(--spacing-3);
      border-radius: var(--radius-lg);
      background: var(--color-surface-variant);
    }
    .target__body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .target__name {
      margin: 0;
      color: var(--color-ink);
      font-family: var(--font-display);
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
    }
    .target__meta,
    .target__price,
    .target__place {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .target__price strong {
      color: var(--color-ink);
    }
    .target__seller {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin-top: auto;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
    }
    .current,
    .summary,
    .problem {
      display: flex;
      gap: var(--spacing-2);
      margin: 0 0 var(--spacing-4);
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
    }
    .current {
      background: var(--color-accent-container);
      color: var(--color-on-accent-container);
    }
    .summary {
      margin: var(--spacing-2) 0 0;
      background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
      color: var(--color-ink);
    }
    .problem {
      margin: var(--spacing-3) 0 0;
      background: color-mix(in srgb, var(--color-warning) 14%, var(--color-surface));
      color: var(--color-ink);
    }
    .current mat-icon,
    .summary mat-icon,
    .problem mat-icon {
      flex: 0 0 auto;
    }
    .block {
      margin: 0 0 var(--spacing-4);
      padding: 0;
      border: 0;
      min-width: 0;
    }
    .block__title {
      margin-bottom: var(--spacing-2);
      padding: 0;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .kinds {
      max-width: 100%;
    }
    .kinds mat-icon,
    .kinds__single mat-icon {
      width: 18px;
      height: 18px;
      margin-right: 4px;
      font-size: 18px;
      vertical-align: -3px;
    }
    .kinds__single {
      margin: 0;
    }
    .muted {
      color: var(--color-text-muted);
    }
    .cash {
      display: flex;
      gap: var(--spacing-3);
      margin-bottom: var(--spacing-3);
    }
    .cash__amount {
      flex: 1 1 auto;
    }
    .cash__currency {
      flex: 0 0 auto;
      width: 136px;
    }
    .protection {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      margin: 0 0 var(--spacing-4);
    }
    .protection__hint {
      margin: 0 0 0 40px;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .protection__kept {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0 0 var(--spacing-4);
      color: var(--color-ink);
      font-size: var(--font-size-sm);
    }
    .protection__kept mat-icon {
      color: var(--color-success);
    }
    .wide {
      display: block;
      width: 100%;
    }
    .expiry {
      width: 220px;
    }
    .field-error {
      margin: var(--spacing-2) 0 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    @media (max-width: 599px) {
      .target {
        grid-template-columns: 64px 1fr;
      }
      .kinds {
        display: flex;
        width: 100%;
      }
      .kinds mat-button-toggle {
        flex: 1 1 0;
      }
      .kinds mat-icon {
        display: none;
      }
      .cash__currency {
        width: 108px;
      }
      .expiry {
        width: 100%;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MakeOfferDialogComponent {
  private readonly api = inject(OffersService);
  private readonly flags = inject(FeatureFlagsService);
  private readonly ref =
    inject<MatDialogRef<MakeOfferDialogComponent, MakeOfferResult>>(MatDialogRef);
  protected readonly data = inject<MakeOfferDialogData>(MAT_DIALOG_DATA);

  protected readonly counter = this.data.counter ?? null;
  protected readonly kindInfo = OFFER_KIND_INFO;
  protected readonly expiryOptions = OFFER_EXPIRY_OPTIONS;
  protected readonly messageMax = OFFER_MESSAGE_MAX;
  protected readonly ids = { kind: `offer-kind-${Math.random().toString(36).slice(2, 8)}` };
  /** One key per dialog: a double submit or a retry after a lost answer repeats the first. */
  private readonly idempotencyKey = newRequestId();

  /** Cards the seller may keep in a counter-offer (always the buyer's). */
  protected readonly pool: TradeLine[] = (this.counter?.offer.tradeItems ?? [])
    .map((line) => tradeLineFromOffer(line))
    .filter((line): line is TradeLine => line !== null);
  protected readonly pickerMode: 'inventory' | 'proposal' =
    this.counter?.viewerRole === 'SELLER' ? 'proposal' : 'inventory';
  protected readonly kinds: OfferKind[] = this.kindsFor();
  protected readonly currencies = CURRENCIES.includes(this.data.target.currency)
    ? CURRENCIES
    : [this.data.target.currency, ...CURRENCIES];

  protected readonly form: OfferForm = createOfferForm(this.initialValue());

  private readonly value = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );
  protected readonly kind = computed<OfferKind>(() => this.value().kind ?? this.kinds[0] ?? 'CASH');
  protected readonly hasCash = computed(() => kindHasCash(this.kind()));
  protected readonly hasCards = computed(() => kindHasCards(this.kind()));
  protected readonly cards = computed(() => this.value().cards ?? []);
  protected readonly messageLength = computed(() => (this.value().message ?? '').length);
  /** New offers with a cash part may ask for payment protection while the flag is on. */
  protected readonly protectionAvailable = computed(
    () => !this.counter && this.hasCash() && this.flags.enabled(FEATURE.protectedPayments)(),
  );
  protected readonly protected = computed(
    () =>
      this.hasCash() &&
      (this.protectionAvailable()
        ? this.value().protectionRequested === true
        : !!this.counter?.offer.protectionRequested),
  );
  protected readonly termsText = computed(() => {
    const value = this.value();
    return offerTermsText({
      kind: this.kind(),
      cashAmount: value.cashAmount,
      currency: value.currency,
      cards: value.cards ?? [],
    });
  });
  protected readonly askingPrice = computed(() =>
    formatPrice(this.data.target.askingPrice, this.data.target.currency),
  );
  protected readonly cashHint = computed(() =>
    this.askingPrice()
      ? `The asking price is ${this.askingPrice()}.`
      : 'No asking price: offer what the card is worth to you.',
  );
  protected readonly singleKindHint = computed(() =>
    this.pickerMode === 'proposal' && this.kinds.length === 1
      ? 'the buyer offered no cards'
      : this.kinds[0] === 'CASH'
        ? 'this card is for sale'
        : 'this card is for trade',
  );
  protected readonly currentTerms = computed(() => {
    const offer = this.counter?.offer;
    return offer
      ? offerTermsText({
          kind: offer.kind,
          cashAmount: offer.cashAmount,
          currency: offer.currency,
          cards: offer.tradeItems,
        })
      : '';
  });

  protected readonly submitting = signal(false);
  protected readonly problem = signal<OfferProblem | null>(null);
  protected readonly cardsTouched = signal(false);
  /** An open offer already exists: sending again cannot succeed. */
  protected readonly blocked = computed(() => !!this.problem()?.openOfferId);
  protected readonly submitLabel = computed(() => {
    if (this.submitting()) {
      return 'Sending…';
    }
    return this.counter ? 'Send counter-offer' : 'Send offer';
  });

  protected setCards(lines: TradeLine[]): void {
    this.cardsTouched.set(true);
    this.form.controls.cards.setValue(lines);
  }

  protected fieldError(name: FieldName): string {
    const control: AbstractControl = this.form.controls[name];
    const server: unknown = control.errors?.['server'];
    if (typeof server === 'string') {
      return server;
    }
    switch (name) {
      case 'cashAmount':
        return cashError(control.errors) ?? '';
      case 'cards':
        return cardsError(control.errors) ?? '';
      case 'message':
        return `Keep the note under ${OFFER_MESSAGE_MAX} characters.`;
      default:
        return 'Choose when the offer expires.';
    }
  }

  protected close(): void {
    this.ref.close();
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.submitting() || this.kinds.length === 0 || this.blocked()) {
      return;
    }
    this.cardsTouched.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue() as OfferFormValue;
    const counter = this.counter;
    if (counter && sameDeal(value, counter.offer)) {
      this.showFieldProblem(
        value.kind === 'TRADE' ? 'cards' : 'cashAmount',
        'A counter-offer must change the amount or the cards.',
      );
      return;
    }
    this.submitting.set(true);
    this.problem.set(null);
    try {
      const offer = await firstValueFrom(
        counter
          ? this.api.counterOffer(
              {
                id: counter.offer.id,
                counterOfferRequest: toCounterRequest(value, counter.offer.version),
              },
              'body',
              false,
              { context: silentErrors() },
            )
          : this.api.createOffer(
              {
                createOfferRequest: toCreateRequest(this.data.target.itemId, value),
                idempotencyKey: this.idempotencyKey,
              },
              'body',
              false,
              { context: silentErrors() },
            ),
      );
      this.ref.close({ offer });
    } catch (error) {
      const problem = offerProblem(
        toApiError(error),
        counter?.otherName ?? this.data.target.seller.displayName,
      );
      if (counter && problem.reload) {
        this.ref.close({ problem });
        return;
      }
      for (const [field, message] of Object.entries(problem.fields)) {
        this.form.controls[field as FieldName].setErrors({ server: message });
      }
      this.problem.set(problem);
    } finally {
      this.submitting.set(false);
    }
  }

  private showFieldProblem(field: FieldName, message: string): void {
    this.form.controls[field].setErrors({ server: message });
    this.form.controls[field].markAsTouched();
    this.problem.set({
      code: 'SAME_DEAL',
      message,
      openOfferId: null,
      latestOfferId: null,
      reload: false,
      fields: { [field]: message },
    });
  }

  private kindsFor(): OfferKind[] {
    const counter = this.data.counter;
    const target = this.data.target;
    if (!counter) {
      return allowedOfferKinds(target.availability, target.acceptsOffers);
    }
    if (counter.viewerRole === 'SELLER') {
      // A seller may propose any kind, but the cards can only be the buyer's.
      return this.pool.length > 0 ? ['CASH', 'TRADE', 'MIXED'] : ['CASH'];
    }
    // The buyer's counter-offers follow the card's availability.
    return allowedOfferKinds(target.availability, true);
  }

  private initialValue(): OfferFormValue {
    const target = this.data.target;
    if (!this.counter) {
      return newOfferValue(this.kinds, target.currency);
    }
    const value = counterValue(this.counter.offer, target.currency);
    return this.kinds.includes(value.kind) ? value : { ...value, kind: this.kinds[0] ?? 'CASH' };
  }
}
