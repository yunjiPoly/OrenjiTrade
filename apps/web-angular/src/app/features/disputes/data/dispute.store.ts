import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Dispute, DisputesService } from '@orenji/api-client';
import { Subscription, filter, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import { NotificationCenter } from '../../../core/notifications/notification-center.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { paymentProblem } from '../../../shared/payments/payment-problems';

export type DisputePageStatus = 'loading' | 'ready' | 'not-found' | 'error';
export type DisputeBusy = 'evidence' | 'message' | null;

export interface DisputeNotice {
  tone: 'success' | 'info' | 'warning';
  message: string;
}

/**
 * `/disputes/:id` for the two parties (`GET /disputes/{id}`; 404 for anybody else): the dispute
 * with its timeline, evidence and thread, adding IMAGE / DOCUMENT evidence
 * (`POST /disputes/{id}/evidence`, multipart) and posting messages
 * (`POST /disputes/{id}/messages`). Refusals (409 EVIDENCE_LIMIT_REACHED, a FROZEN or resolved
 * dispute, 413, 415) are explained and the dispute re-read. DISPUTE_UPDATE notifications of this
 * dispute and realtime reconnections re-read it. Provided by the dispute page.
 */
@Injectable()
export class DisputeStore {
  private readonly api = inject(DisputesService);
  private readonly center = inject(NotificationCenter);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly disputeState = signal<Dispute | null>(null);
  private readonly statusState = signal<DisputePageStatus>('loading');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly busyState = signal<DisputeBusy>(null);
  private readonly noticeState = signal<DisputeNotice | null>(null);

  readonly dispute = this.disputeState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly busy = this.busyState.asReadonly();
  readonly notice = this.noticeState.asReadonly();
  /** The other party's display name. */
  readonly otherName = computed(() => {
    const dispute = this.disputeState();
    if (!dispute) {
      return 'the other collector';
    }
    return dispute.viewerRole === 'SELLER' ? dispute.buyer.displayName : dispute.seller.displayName;
  });

  private id: string | null = null;
  private loadSubscription: Subscription | null = null;
  private started = false;

  init(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.center.pushed$
      .pipe(
        filter((notification) => {
          const id = this.disputeState()?.id;
          return !!id && notification.data?.['disputeId'] === id;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => void this.refresh());
    this.realtime.resync$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.refresh());
    this.destroyRef.onDestroy(() => this.loadSubscription?.unsubscribe());
  }

  load(id: string): void {
    this.loadSubscription?.unsubscribe();
    this.id = id;
    if (this.disputeState()?.id !== id) {
      this.statusState.set('loading');
      this.noticeState.set(null);
    }
    this.errorState.set(null);
    this.loadSubscription = this.api
      .getDispute({ id }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (dispute) => this.show(dispute),
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

  showNotice(notice: DisputeNotice): void {
    this.noticeState.set(notice);
  }

  async refresh(): Promise<void> {
    const id = this.id;
    if (!id || this.statusState() !== 'ready') {
      return;
    }
    try {
      const dispute = await firstValueFrom(
        this.api.getDispute({ id }, 'body', false, { context: silentErrors() }),
      );
      if (id === this.id) {
        this.show(dispute);
      }
    } catch {
      // Keep what is on screen.
    }
  }

  /** Uploads a photo or a PDF with an optional caption; resolves whether it was added. */
  async addEvidence(file: File, kind: 'IMAGE' | 'DOCUMENT', caption: string): Promise<boolean> {
    const dispute = this.disputeState();
    if (!dispute || this.busyState()) {
      return false;
    }
    const body = caption.trim();
    return this.run('evidence', async () => {
      await firstValueFrom(
        this.api.addDisputeEvidence(
          { id: dispute.id, file, kind, ...(body ? { body } : {}) },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      await this.refresh();
      this.noticeState.set({
        tone: 'success',
        message: `${kind === 'IMAGE' ? 'Photo' : 'Document'} added. ${this.otherName()} and OrenjiTrade can see it.`,
      });
    });
  }

  /** Posts in the thread; resolves whether it was posted. */
  async postMessage(text: string): Promise<boolean> {
    const dispute = this.disputeState();
    const body = text.trim();
    if (!dispute || !body || this.busyState()) {
      return false;
    }
    return this.run('message', async () => {
      const message = await firstValueFrom(
        this.api.postDisputeMessage(
          { id: dispute.id, disputeMessageRequest: { body } },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.disputeState.update((current) =>
        current && !current.messages.some((entry) => entry.id === message.id)
          ? { ...current, messages: [...current.messages, message] }
          : current,
      );
      void this.refresh();
    });
  }

  private async run(busy: Exclude<DisputeBusy, null>, call: () => Promise<void>): Promise<boolean> {
    this.busyState.set(busy);
    this.noticeState.set(null);
    try {
      await call();
      return true;
    } catch (error) {
      const apiError = toApiError(error);
      const message =
        apiError.errorCode === 'INVALID_STATE_TRANSITION'
          ? 'This dispute is on hold or already decided: evidence and messages are closed for now.'
          : paymentProblem(apiError, this.otherName()).message;
      this.noticeState.set({ tone: 'warning', message });
      await this.refresh();
      return false;
    } finally {
      this.busyState.set(null);
    }
  }

  private show(dispute: Dispute): void {
    this.disputeState.set(dispute);
    this.statusState.set('ready');
  }

  private fail(error: ApiError): void {
    if (error.status === 404 || error.errorCode === 'VALIDATION_FAILED') {
      this.disputeState.set(null);
      this.statusState.set('not-found');
    } else {
      this.errorState.set(error);
      this.statusState.set('error');
    }
  }
}
