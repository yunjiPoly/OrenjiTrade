import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { OfferResponse, OffersService } from '@orenji/api-client';
import { Observable, Subscription, filter, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import { NotificationCenter } from '../../../core/notifications/notification-center.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { MakeOfferResult } from '../../../shared/offers/make-offer-dialog.component';
import { OfferAction, OfferRole, isLiveOffer } from '../../../shared/offers/offer-labels';
import { OfferProblem, offerProblem } from '../../../shared/offers/offer-problems';

export type OfferPageStatus = 'loading' | 'ready' | 'not-found' | 'error';

/** A message above the offer (answer sent, the offer changed, a refusal). */
export interface OfferNotice {
  tone: 'success' | 'info' | 'warning';
  message: string;
}

/**
 * `/offers/:id`: one proposal with the chain's history. Answers (accept, decline, withdraw) send
 * the version on screen; a counter-offer moves the page to the new proposal. Conflicts follow
 * the server: 409 STALE_OFFER moves to `latestOfferId` (or re-reads), 409 NOT_YOUR_TURN /
 * INVALID_STATE_TRANSITION / ITEM_UNAVAILABLE re-read the offer, and every refusal is explained
 * in the notice. Offer notifications of this chain and realtime reconnections re-read it; when
 * the proposal on screen gets answered, the page follows to the live one. Provided by the page.
 */
@Injectable()
export class OfferDetailStore {
  private readonly api = inject(OffersService);
  private readonly router = inject(Router);
  private readonly center = inject(NotificationCenter);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly offerState = signal<OfferResponse | null>(null);
  private readonly statusState = signal<OfferPageStatus>('loading');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly busyState = signal<OfferAction | null>(null);
  private readonly noticeState = signal<OfferNotice | null>(null);

  readonly offer = this.offerState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly busy = this.busyState.asReadonly();
  readonly notice = this.noticeState.asReadonly();

  readonly viewerRole = computed<OfferRole | null>(() => this.offerState()?.viewerRole ?? null);
  /** The other party of the viewer. */
  readonly other = computed(() => {
    const offer = this.offerState();
    if (!offer) {
      return null;
    }
    return offer.viewerRole === 'SELLER' ? offer.buyer : offer.seller;
  });
  readonly otherName = computed(() => this.other()?.displayName ?? 'the other collector');
  readonly allowed = computed(() => new Set<string>(this.offerState()?.allowedActions ?? []));
  /** The viewer has to answer this proposal. */
  readonly yourTurn = computed(() => {
    const offer = this.offerState();
    return (
      !!offer &&
      isLiveOffer(offer.status) &&
      !offer.superseded &&
      (offer.currentTurn as string) === offer.viewerRole
    );
  });
  /** Waiting for the other party's answer. */
  readonly waiting = computed(() => {
    const offer = this.offerState();
    return (
      !!offer &&
      isLiveOffer(offer.status) &&
      !offer.superseded &&
      (offer.currentTurn as string) !== offer.viewerRole
    );
  });

  private id: string | null = null;
  /** The next load comes from the store itself (keep the notice that explains it). */
  private keepNotice = false;
  private loadSubscription: Subscription | null = null;
  private started = false;

  init(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.center.pushed$
      .pipe(
        filter((notification) => this.concernsChain(notification.data)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => void this.refresh(true));
    this.realtime.resync$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.refresh(true));
    this.destroyRef.onDestroy(() => this.loadSubscription?.unsubscribe());
  }

  /** Loads a proposal with the skeleton (route changes, retry). */
  load(id: string): void {
    this.loadSubscription?.unsubscribe();
    if (this.id !== null && this.id !== id && !this.keepNotice) {
      this.noticeState.set(null);
    }
    this.keepNotice = false;
    this.id = id;
    if (this.offerState()?.id !== id) {
      this.statusState.set('loading');
    }
    this.errorState.set(null);
    this.loadSubscription = this.read(id).subscribe({
      next: (offer) => this.show(offer),
      error: (error: unknown) => this.fail(toApiError(error)),
    });
  }

  retry(): void {
    if (this.id) {
      this.load(this.id);
    }
  }

  dismissNotice(): void {
    this.noticeState.set(null);
  }

  /**
   * Quietly re-reads the proposal. With `follow`, a proposal answered in the meantime by a
   * counter-offer is replaced by the live one.
   */
  async refresh(follow = false): Promise<void> {
    const id = this.id;
    if (!id || this.statusState() !== 'ready') {
      return;
    }
    try {
      const offer = await firstValueFrom(this.read(id));
      if (id !== this.id) {
        return;
      }
      if (follow && offer.superseded && offer.latestOfferId !== id) {
        await this.goTo(offer.latestOfferId);
        return;
      }
      this.show(offer);
    } catch {
      // Keep what is on screen.
    }
  }

  async accept(): Promise<OfferResponse | null> {
    return this.act('ACCEPT', (offer) =>
      this.api.acceptOffer(
        { id: offer.id, acceptOfferRequest: { version: offer.version } },
        'body',
        false,
        { context: silentErrors() },
      ),
    );
  }

  async decline(reason: string): Promise<OfferResponse | null> {
    return this.act('DECLINE', (offer) =>
      this.api.declineOffer(
        {
          id: offer.id,
          closeOfferRequest: { ...(reason ? { reason } : {}), version: offer.version },
        },
        'body',
        false,
        { context: silentErrors() },
      ),
    );
  }

  async cancel(reason: string): Promise<OfferResponse | null> {
    return this.act('CANCEL', (offer) =>
      this.api.cancelOffer(
        {
          id: offer.id,
          closeOfferRequest: { ...(reason ? { reason } : {}), version: offer.version },
        },
        'body',
        false,
        { context: silentErrors() },
      ),
    );
  }

  /** The outcome of the counter-offer dialog: go to the new proposal, or handle the refusal. */
  async countered(result: MakeOfferResult): Promise<void> {
    if ('offer' in result) {
      this.noticeState.set({
        tone: 'success',
        message: `Counter-offer sent. ${this.otherName()} has until its expiry to answer.`,
      });
      this.offerState.set(result.offer);
      await this.goTo(result.offer.id);
      return;
    }
    await this.handleProblem(result.problem);
  }

  markBusy(action: OfferAction | null): void {
    this.busyState.set(action);
  }

  private async act(
    action: OfferAction,
    call: (offer: OfferResponse) => Observable<OfferResponse>,
  ): Promise<OfferResponse | null> {
    const offer = this.offerState();
    if (!offer || this.busyState()) {
      return null;
    }
    this.busyState.set(action);
    this.noticeState.set(null);
    try {
      const updated = await firstValueFrom(call(offer));
      this.show(updated);
      this.noticeState.set({ tone: 'success', message: this.successMessage(action) });
      return updated;
    } catch (error) {
      await this.handleProblem(offerProblem(toApiError(error), this.otherName()));
      return null;
    } finally {
      this.busyState.set(null);
    }
  }

  private async handleProblem(problem: OfferProblem): Promise<void> {
    this.noticeState.set({ tone: 'warning', message: problem.message });
    if (problem.latestOfferId && problem.latestOfferId !== this.id) {
      await this.goTo(problem.latestOfferId);
    } else if (problem.reload) {
      await this.refresh(false);
    }
  }

  private successMessage(action: OfferAction): string {
    switch (action) {
      case 'ACCEPT':
        return (
          'Offer accepted. The trade is open: arrange the exchange with ' + `${this.otherName()}.`
        );
      case 'DECLINE':
        return `Offer declined. ${this.otherName()} was notified.`;
      case 'CANCEL':
        return `Offer withdrawn. ${this.otherName()} was notified.`;
      default:
        return 'Done.';
    }
  }

  private read(id: string): Observable<OfferResponse> {
    return this.api.getOffer({ id }, 'body', false, { context: silentErrors() });
  }

  private show(offer: OfferResponse): void {
    this.offerState.set(offer);
    this.statusState.set('ready');
  }

  private fail(error: ApiError): void {
    if (error.status === 404 || error.errorCode === 'VALIDATION_FAILED') {
      this.offerState.set(null);
      this.statusState.set('not-found');
    } else {
      this.errorState.set(error);
      this.statusState.set('error');
    }
  }

  private async goTo(id: string): Promise<void> {
    this.keepNotice = true;
    await this.router.navigate(['/offers', id], { replaceUrl: true });
  }

  /** Whether a pushed notification is about the negotiation on screen. */
  private concernsChain(data: Record<string, unknown> | null | undefined): boolean {
    const offer = this.offerState();
    if (!offer || !data) {
      return false;
    }
    const root = data['rootOfferId'];
    const offerId = data['offerId'];
    return root === offer.rootOfferId || offerId === offer.id || offerId === offer.latestOfferId;
  }
}
