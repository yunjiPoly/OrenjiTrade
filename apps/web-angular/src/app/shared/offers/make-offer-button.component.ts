import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { OfferResponse } from '@orenji/api-client';
import { SessionService } from '../../core/auth/session.service';
import { OfferActionsService } from './offer-actions.service';
import { OfferTarget, canOfferOn } from './offer-target';

/**
 * "Make an offer" on a public card. Shown only when the card accepts at least one kind of offer
 * and is not the viewer's own; signed-out visitors are sent to sign in. Opens the offer dialog
 * and emits the created offer.
 */
@Component({
  selector: 'app-make-offer-button',
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (visible()) {
      <button
        [matButton]="appearance()"
        type="button"
        class="mob"
        [class.mob--compact]="compact()"
        [disabled]="opening()"
        [attr.aria-label]="'Make an offer on ' + target().cardName"
        (click)="open()"
      >
        <mat-icon aria-hidden="true">local_offer</mat-icon>
        Make an offer
      </button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .mob--compact {
      --mat-button-outlined-container-height: 32px;
      --mat-button-filled-container-height: 32px;
      --mat-button-tonal-container-height: 32px;
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MakeOfferButtonComponent {
  private readonly session = inject(SessionService);
  private readonly offers = inject(OfferActionsService);

  readonly target = input.required<OfferTarget>();
  readonly appearance = input<'filled' | 'outlined' | 'tonal' | 'text'>('tonal');
  readonly compact = input(false, { transform: booleanAttribute });
  readonly offered = output<OfferResponse>();

  protected readonly opening = signal(false);
  protected readonly visible = computed(() => canOfferOn(this.target(), this.session.me()?.id));

  protected async open(): Promise<void> {
    this.opening.set(true);
    try {
      const offer = await this.offers.makeOffer(this.target());
      if (offer) {
        this.offered.emit(offer);
      }
    } finally {
      this.opening.set(false);
    }
  }
}
