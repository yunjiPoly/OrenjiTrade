import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import type { OpenDisputeRequest, ShipTradeRequest } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { safeAppPath } from '../../../core/notifications/notification-kinds';
import { OfferActionsService } from '../../../shared/offers/offer-actions.service';
import { formatDateTime, money } from '../../../shared/payments/payment-labels';
import {
  OpenDisputeDialogComponent,
  OpenDisputeDialogData,
} from '../dialogs/open-dispute-dialog.component';
import { ShipDialogComponent, ShipDialogData } from '../dialogs/ship-dialog.component';
import { TradeDetailStore } from './trade-detail.store';

/**
 * The payment-protection steps of the trade page (Phase 9): Pay (goes to the provider's checkout;
 * the local fake provider answers the web path `/checkout/fake/<ref>`), Ship (dialog), Confirm
 * receipt (confirmation) and Open a dispute (dialog, then the dispute page). Provided by the
 * trade page next to its {@link TradeDetailStore}.
 */
@Injectable()
export class TradeProtectionActions {
  private readonly store = inject(TradeDetailStore);
  private readonly dialog = inject(MatDialog);
  private readonly offers = inject(OfferActionsService);
  private readonly router = inject(Router);

  async pay(): Promise<void> {
    const payment = await this.store.pay();
    if (!payment) {
      return;
    }
    const path = safeAppPath(payment.checkoutUrl);
    if (path) {
      await this.router.navigateByUrl(path);
      return;
    }
    if (payment.checkoutUrl && /^https:\/\//.test(payment.checkoutUrl)) {
      window.location.assign(payment.checkoutUrl);
      return;
    }
    this.store.showNotice({
      tone: 'warning',
      message:
        'This payment provider’s checkout cannot open here yet. Your payment was not started.',
    });
  }

  async ship(): Promise<void> {
    const trade = this.store.trade();
    if (!trade) {
      return;
    }
    const request = await firstValueFrom(
      this.dialog
        .open<ShipDialogComponent, ShipDialogData, ShipTradeRequest>(ShipDialogComponent, {
          data: {
            buyerName: trade.counterparty.displayName,
            cardName: trade.offer.item?.card.name ?? 'the card',
          },
          panelClass: 'app-dialog--md',
        })
        .afterClosed(),
    );
    if (request) {
      await this.store.ship(request);
    }
  }

  async confirmReceipt(): Promise<void> {
    const trade = this.store.trade();
    if (!trade) {
      return;
    }
    const payout = money(trade.payment?.sellerAmount, trade.payment?.currency);
    const confirmed = await this.offers.confirm({
      title: 'Confirm you received the card?',
      message:
        `Confirm only once the card arrived and matches the listing. The payout (${payout}) is ` +
        `released to ${trade.counterparty.displayName} and the trade completes; this cannot be ` +
        'undone. If something is wrong, open a dispute instead.',
      confirmLabel: 'Confirm receipt',
    });
    if (confirmed) {
      await this.store.confirmReceipt();
    }
  }

  async openDispute(): Promise<void> {
    const trade = this.store.trade();
    if (!trade) {
      return;
    }
    const window = trade.payment?.disputeWindowEndsAt;
    const request = await firstValueFrom(
      this.dialog
        .open<OpenDisputeDialogComponent, OpenDisputeDialogData, OpenDisputeRequest>(
          OpenDisputeDialogComponent,
          {
            data: {
              sellerName: trade.counterparty.displayName,
              cardName: trade.offer.item?.card.name ?? 'the card',
              windowEndsAt: window ? formatDateTime(window) : null,
            },
            panelClass: 'app-dialog--md',
            maxHeight: '92vh',
          },
        )
        .afterClosed(),
    );
    if (!request) {
      return;
    }
    const dispute = await this.store.openDispute(request);
    if (dispute) {
      await this.router.navigate(['/disputes', dispute.id], {
        queryParams: { opened: 1 },
      });
    }
  }
}
