import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { friendlyMessage } from '../../core/http/api-error-messages';
import {
  DisputeOverviewComponent,
  DisputeViewer,
} from '../../shared/payments/dispute-overview.component';
import { DisputeThreadComponent } from '../../shared/payments/dispute-thread.component';
import { DisputeTimelineComponent } from '../../shared/payments/dispute-timeline.component';
import { EvidenceListComponent } from '../../shared/payments/evidence-list.component';
import { isOpenDispute } from '../../shared/payments/payment-labels';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { DisputeStore } from './data/dispute.store';
import { EvidenceUpload, EvidenceUploaderComponent } from './evidence-uploader.component';

/**
 * `/disputes/:id` for the two collectors of a protected trade (anybody else gets the not-found
 * state): the summary with the decision, the evidence of both sides with photo / PDF uploads
 * (`evidenceLeft`), the thread with OrenjiTrade support and the timeline. A FROZEN or resolved
 * dispute is read-only. `?opened=1` is the trade page's answer after opening it.
 */
@Component({
  selector: 'app-dispute-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    DisputeOverviewComponent,
    DisputeThreadComponent,
    DisputeTimelineComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    EvidenceListComponent,
    EvidenceUploaderComponent,
    SkeletonComponent,
  ],
  providers: [DisputeStore],
  template: `
    <div class="page dp">
      @switch (store.status()) {
        @case ('loading') {
          <div class="dp__skeleton" aria-busy="true">
            <span class="visually-hidden">Loading the dispute</span>
            <app-skeleton height="48px" width="50%" />
            <app-skeleton height="220px" />
            <app-skeleton height="160px" />
          </div>
        }
        @case ('not-found') {
          <app-empty-state
            icon="gavel"
            title="This dispute is not available"
            description="It does not exist, or you are not one of the two collectors of its trade."
          >
            <a actions matButton="filled" routerLink="/trades">My trades</a>
          </app-empty-state>
        }
        @case ('error') {
          <app-error-state
            title="This dispute could not load"
            [message]="errorMessage()"
            [requestId]="store.error()?.requestId ?? null"
            (retry)="store.retry()"
          />
        }
        @case ('ready') {
          @if (store.dispute(); as dispute) {
            <a class="dp__back" [routerLink]="['/trades', dispute.tradeId]">
              <mat-icon aria-hidden="true">arrow_back</mat-icon>
              Back to the trade
            </a>
            <header class="dp__head">
              <p class="dp__eyebrow">Dispute with {{ store.otherName() }}</p>
              <h1 class="dp__title">Payment protection dispute</h1>
            </header>

            @if (store.notice(); as notice) {
              <div
                class="dp__notice"
                [attr.data-tone]="notice.tone"
                [attr.role]="notice.tone === 'warning' ? 'alert' : 'status'"
                data-testid="dispute-notice"
              >
                <mat-icon aria-hidden="true">{{
                  notice.tone === 'success' ? 'check_circle' : 'info'
                }}</mat-icon>
                <span>{{ notice.message }}</span>
                <button
                  matIconButton
                  type="button"
                  aria-label="Dismiss the message"
                  (click)="store.dismissNotice()"
                >
                  <mat-icon>close</mat-icon>
                </button>
              </div>
            }

            <div class="dp__grid">
              <div class="dp__main">
                <app-dispute-overview [dispute]="dispute" [viewer]="viewer()" />

                <section class="dp__section" aria-labelledby="dp-evidence">
                  <div class="dp__section-head">
                    <h2 id="dp-evidence" class="dp__h2">Evidence</h2>
                    <span class="dp__count">{{ dispute.evidence.length }}</span>
                  </div>
                  <p class="dp__muted">
                    Photos of the card and the package, receipts or anything that helps an admin
                    understand what happened. Everything here is private to you,
                    {{ store.otherName() }} and OrenjiTrade.
                  </p>
                  <app-evidence-list
                    [disputeId]="dispute.id"
                    [evidence]="dispute.evidence"
                    [viewer]="dispute.viewerRole"
                    [buyerName]="dispute.buyer.displayName"
                    [sellerName]="dispute.seller.displayName"
                  />
                  @if (dispute.canAddEvidence) {
                    <app-evidence-uploader
                      [evidenceLeft]="dispute.evidenceLeft"
                      [busy]="store.busy() === 'evidence'"
                      (add)="addEvidence($event)"
                    />
                  } @else if (open()) {
                    <p class="dp__muted" role="note">{{ closedText() }}</p>
                  }
                </section>

                <section class="dp__section" aria-labelledby="dp-thread">
                  <h2 id="dp-thread" class="dp__h2">Messages</h2>
                  <app-dispute-thread
                    [messages]="dispute.messages"
                    [viewer]="dispute.viewerRole"
                    [canPost]="dispute.canPostMessage"
                    [busy]="store.busy() === 'message'"
                    [label]="'Message to ' + store.otherName() + ' and OrenjiTrade'"
                    [closedText]="closedText()"
                    (send)="postMessage($event)"
                  />
                </section>
              </div>
              <aside class="dp__side">
                <section class="dp__section" aria-labelledby="dp-timeline">
                  <h2 id="dp-timeline" class="dp__h2">Timeline</h2>
                  <app-dispute-timeline
                    [timeline]="dispute.timeline"
                    [viewer]="dispute.viewerRole"
                    [buyerName]="dispute.buyer.displayName"
                    [sellerName]="dispute.seller.displayName"
                    [currency]="dispute.payment.currency"
                  />
                </section>
                <p class="dp__help">
                  <mat-icon aria-hidden="true">support_agent</mat-icon>
                  <span>
                    An OrenjiTrade admin reviews both sides and decides: a refund to the buyer, the
                    payout to the seller, or a split. See the
                    <a routerLink="/legal/refund-dispute">Refund and Dispute Policy</a>.
                  </span>
                </p>
              </aside>
            </div>
          }
        }
      }
    </div>
  `,
  styles: `
    .dp {
      max-width: 1180px;
    }
    .dp__skeleton {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
    }
    .dp__back {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      margin-bottom: var(--spacing-3);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      text-decoration: none;
    }
    .dp__back:hover {
      color: var(--color-ink);
    }
    .dp__back mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .dp__head {
      margin-bottom: var(--spacing-5);
    }
    .dp__eyebrow {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
    }
    .dp__title {
      margin: 2px 0 0;
      font-size: var(--font-size-3xl);
    }
    .dp__notice {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      margin-bottom: var(--spacing-4);
      padding: var(--spacing-2) var(--spacing-2) var(--spacing-2) var(--spacing-4);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-info) 12%, var(--color-surface));
    }
    .dp__notice > span {
      flex: 1 1 auto;
    }
    .dp__notice[data-tone='success'] {
      background: color-mix(in srgb, var(--color-success) 14%, var(--color-surface));
    }
    .dp__notice[data-tone='warning'] {
      background: color-mix(in srgb, var(--color-warning) 16%, var(--color-surface));
    }
    .dp__grid {
      display: grid;
      grid-template-columns: minmax(0, 1.7fr) minmax(260px, 1fr);
      align-items: start;
      gap: var(--spacing-6);
    }
    .dp__main,
    .dp__side {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-6);
      min-width: 0;
    }
    .dp__section {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
    }
    .dp__section-head {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
    }
    .dp__h2 {
      margin: 0;
      font-size: var(--font-size-lg);
    }
    .dp__count {
      padding: 0 var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .dp__muted {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .dp__help {
      display: flex;
      gap: var(--spacing-2);
      margin: 0;
      padding: var(--spacing-3);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .dp__help mat-icon {
      flex: 0 0 auto;
    }
    @media (max-width: 959px) {
      .dp__grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisputePageComponent {
  protected readonly store = inject(DisputeStore);
  private readonly uploader = viewChild(EvidenceUploaderComponent);
  private readonly thread = viewChild(DisputeThreadComponent);

  /** Route parameter (bound by the router). */
  readonly id = input.required<string>();
  /** `?opened=1`: the buyer just opened this dispute from the trade page. */
  readonly opened = input<string | undefined>();

  protected readonly viewer = computed<DisputeViewer>(() => {
    const role = this.store.dispute()?.viewerRole;
    return role === 'BUYER' || role === 'SELLER' ? role : 'ADMIN';
  });
  protected readonly open = computed(() => isOpenDispute(this.store.dispute()?.status));
  protected readonly closedText = computed(() => {
    const dispute = this.store.dispute();
    if (!dispute) {
      return null;
    }
    if (dispute.status === 'FROZEN') {
      return 'The dispute is on hold: evidence and messages are paused until OrenjiTrade lifts the hold.';
    }
    if (!this.open()) {
      return 'The dispute is decided: the thread is closed.';
    }
    if (!dispute.canAddEvidence && dispute.evidenceLeft <= 0) {
      return 'You added the most evidence allowed (10). Use the messages to add details.';
    }
    return null;
  });
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });

  private openedNoticeShown = false;

  constructor() {
    this.store.init();
    effect(() => {
      const id = this.id();
      untracked(() => this.store.load(id));
    });
    effect(() => {
      const dispute = this.store.dispute();
      if (!dispute || this.opened() !== '1' || this.openedNoticeShown) {
        return;
      }
      this.openedNoticeShown = true;
      untracked(() =>
        this.store.showNotice({
          tone: 'success',
          message: `Dispute opened. The payout to ${this.store.otherName()} is on hold; add photos or documents below.`,
        }),
      );
    });
  }

  protected async addEvidence(upload: EvidenceUpload): Promise<void> {
    const added = await this.store.addEvidence(upload.file, upload.kind, upload.caption);
    if (added) {
      this.uploader()?.reset();
    }
  }

  protected async postMessage(body: string): Promise<void> {
    const posted = await this.store.postMessage(body);
    if (posted) {
      this.thread()?.reset();
    }
  }
}
