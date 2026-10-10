import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import type { OfferResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../ui/confirm-dialog/confirm-dialog.component';
import {
  MakeOfferDialogComponent,
  MakeOfferDialogData,
  MakeOfferResult,
} from './make-offer-dialog.component';
import { OfferRole, offerTermsText } from './offer-labels';
import {
  OfferReasonDialogComponent,
  OfferReasonDialogData,
  OfferReasonDialogResult,
} from './offer-reason-dialog.component';
import { OfferTarget } from './offer-target';

/**
 * The offer dialogs shared by every entry point (public binder items, card holders, the map's
 * holders list, the collector page) and by the offer and trade pages: make an
 * offer (with a snack-bar confirmation and a link to the offer page), counter-offer, and the
 * confirmations of accept / decline / withdraw and of the trade steps. API calls of the answers
 * stay with the pages, which own the reload on conflicts.
 */
@Injectable({ providedIn: 'root' })
export class OfferActionsService {
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /**
   * "Make an offer": signed-out visitors are sent to sign in first (and come back here). Resolves
   * the created offer, or `null` when the dialog was cancelled.
   */
  async makeOffer(target: OfferTarget): Promise<OfferResponse | null> {
    if (!this.auth.isAuthenticated()) {
      await this.router.navigate(['/auth/sign-in'], {
        queryParams: { returnUrl: this.router.url },
      });
      return null;
    }
    const result = await this.open({ target });
    const offer = result && 'offer' in result ? result.offer : null;
    if (offer) {
      this.snackBar
        .open(`Offer sent to ${target.seller.displayName}.`, 'View offer', { duration: 6000 })
        .onAction()
        .subscribe(() => void this.router.navigate(['/offers', offer.id]));
    }
    return offer;
  }

  /** "Counter": resolves the new proposal, a refusal the page must reload for, or `null`. */
  counter(
    offer: OfferResponse,
    target: OfferTarget,
    viewerRole: OfferRole,
    otherName: string,
  ): Promise<MakeOfferResult | null> {
    return this.open({ target, counter: { offer, viewerRole, otherName } });
  }

  /** "Accept": confirms the terms (accepting opens a trade and is binding). */
  confirmAccept(offer: OfferResponse, otherName: string): Promise<boolean> {
    const terms = offerTermsText({
      kind: offer.kind,
      cashAmount: offer.cashAmount,
      currency: offer.currency,
      cards: offer.tradeItems,
    });
    const card = offer.item?.card.name ?? 'the card';
    return this.confirm({
      title: 'Accept this offer?',
      message:
        `You agree to trade ${card} for ${terms} with ${otherName}. A trade opens where you ` +
        'arrange the exchange; an accepted offer is a commitment.',
      confirmLabel: 'Accept offer',
    });
  }

  /** "Decline": the optional reason (`null` when dismissed). */
  declineReason(otherName: string): Promise<string | null> {
    return this.reason({
      title: 'Decline this offer?',
      message: `${otherName} will be notified. The negotiation ends; they can make a new offer later.`,
      confirmLabel: 'Decline offer',
      label: 'Reason (optional)',
      required: false,
      placeholder: 'For example: the price is too low for this condition.',
      tone: 'danger',
    });
  }

  /** "Withdraw" (the buyer, while OPEN): the optional reason (`null` when dismissed). */
  withdrawReason(otherName: string): Promise<string | null> {
    return this.reason({
      title: 'Withdraw your offer?',
      message: `${otherName} will be notified that you withdrew it.`,
      confirmLabel: 'Withdraw offer',
      label: 'Reason (optional)',
      required: false,
      tone: 'danger',
    });
  }

  /** "Cancel trade": the required reason (`null` when dismissed). */
  tradeCancelReason(otherName: string): Promise<string | null> {
    return this.reason({
      title: 'Cancel this trade?',
      message: `${otherName} will be notified. Cancelled trades cannot be reopened.`,
      confirmLabel: 'Cancel trade',
      label: 'Why are you cancelling?',
      required: true,
      tone: 'danger',
    });
  }

  confirm(data: ConfirmDialogData): Promise<boolean> {
    return firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data,
          panelClass: 'app-dialog--md',
        })
        .afterClosed(),
    ).then((confirmed) => confirmed === true);
  }

  private async reason(data: OfferReasonDialogData): Promise<string | null> {
    const result = await firstValueFrom(
      this.dialog
        .open<OfferReasonDialogComponent, OfferReasonDialogData, OfferReasonDialogResult>(
          OfferReasonDialogComponent,
          { data, panelClass: 'app-dialog--md' },
        )
        .afterClosed(),
    );
    return result ? result.reason : null;
  }

  private async open(data: MakeOfferDialogData): Promise<MakeOfferResult | null> {
    const result = await firstValueFrom(
      this.dialog
        .open<MakeOfferDialogComponent, MakeOfferDialogData, MakeOfferResult>(
          MakeOfferDialogComponent,
          { data, panelClass: 'app-dialog--md', autoFocus: 'dialog', maxHeight: '92vh' },
        )
        .afterClosed(),
    );
    return result ?? null;
  }
}
