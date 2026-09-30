import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import {
  AdminDispute,
  AdminPaymentsService,
  DisputesService,
  ModeratorNote,
  ResolveDisputeRequest,
} from '@orenji/api-client';
import { Observable, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { DisputeOverviewComponent } from '../../../shared/payments/dispute-overview.component';
import { DisputeThreadComponent } from '../../../shared/payments/dispute-thread.component';
import { DisputeTimelineComponent } from '../../../shared/payments/dispute-timeline.component';
import { EvidenceListComponent } from '../../../shared/payments/evidence-list.component';
import { isOpenDispute, refundableOf } from '../../../shared/payments/payment-labels';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { ModeratorNotesComponent } from '../reports/moderator-notes.component';
import { askReason, confirmAdminAction, runAdminAction } from '../shared/admin-actions';
import { AdminDisputeHistoryComponent } from './admin-dispute-history.component';
import { AdminDisputePartiesComponent } from './admin-dispute-parties.component';
import { ResolveDisputeDialogComponent } from './resolve-dispute-dialog.component';
import { ResolveContext } from './resolve-form';

type Busy = 'freeze' | 'unfreeze' | 'note' | 'resolve' | 'message' | null;

/**
 * `/admin/disputes/:id` (ADMIN): the dispute as the parties see it (summary, evidence, thread,
 * timeline) plus internal notes, both parties' histories and rating summaries, and the money
 * trail (trade timeline, payment events, refunds, webhooks). Actions: put on hold (optional
 * reason, kept as an internal note), lift the hold, add a note (the first one starts the review),
 * post in the thread as OrenjiTrade support and resolve (buyer / seller / split with a refund
 * amount and a note). Every write is confirmed and audited.
 */
@Component({
  selector: 'app-admin-dispute-detail-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    AdminDisputeHistoryComponent,
    AdminDisputePartiesComponent,
    DisputeOverviewComponent,
    DisputeThreadComponent,
    DisputeTimelineComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    EvidenceListComponent,
    ModeratorNotesComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page ad">
      <a class="ad__back" routerLink="/admin/disputes">
        <mat-icon aria-hidden="true">arrow_back</mat-icon>
        Disputes
      </a>
      @if (error(); as error) {
        @if (error.status === 404) {
          <app-empty-state icon="gavel" title="This dispute does not exist" />
        } @else {
          <app-error-state
            title="The dispute could not load"
            [message]="errorMessage()"
            [requestId]="error.requestId"
            (retry)="load()"
          />
        }
      } @else if (detail(); as d) {
        @let dispute = d.dispute;
        <header class="ad__head">
          <h1 class="ad__title">Dispute</h1>
          <div class="ad__actions" role="group" aria-label="Dispute actions">
            @if (open()) {
              @if (dispute.status === 'FROZEN') {
                <button
                  matButton="outlined"
                  type="button"
                  [disabled]="!!busy()"
                  (click)="unfreeze()"
                >
                  <mat-icon aria-hidden="true">lock_open</mat-icon>
                  Lift the hold
                </button>
              } @else {
                <button matButton="outlined" type="button" [disabled]="!!busy()" (click)="freeze()">
                  <mat-icon aria-hidden="true">ac_unit</mat-icon>
                  Put on hold
                </button>
              }
              <button matButton="filled" type="button" [disabled]="!!busy()" (click)="resolve()">
                <mat-icon aria-hidden="true">balance</mat-icon>
                {{ busy() === 'resolve' ? 'Resolving…' : 'Resolve' }}
              </button>
            }
            <a
              matButton
              routerLink="/admin/audit-logs"
              [queryParams]="{ targetType: 'DISPUTE', targetId: dispute.id }"
            >
              <mat-icon aria-hidden="true">history</mat-icon>
              Audit log
            </a>
            <a matButton [routerLink]="['/admin/payments', dispute.payment.id]">
              <mat-icon aria-hidden="true">payments</mat-icon>
              Payment
            </a>
          </div>
        </header>

        <div class="ad__grid">
          <div class="ad__main">
            <app-dispute-overview [dispute]="dispute" viewer="ADMIN" />

            <section class="admin-card" aria-labelledby="ad-evidence">
              <h2 id="ad-evidence">Evidence ({{ dispute.evidence.length }})</h2>
              <app-evidence-list
                [disputeId]="dispute.id"
                [evidence]="dispute.evidence"
                [buyerName]="dispute.buyer.displayName"
                [sellerName]="dispute.seller.displayName"
              />
            </section>

            <section class="admin-card" aria-labelledby="ad-thread">
              <h2 id="ad-thread">Thread with the collectors</h2>
              <p class="admin-muted ad__hint">
                Your messages appear to both collectors as “OrenjiTrade support”.
              </p>
              <app-dispute-thread
                [messages]="dispute.messages"
                viewer="ADMIN"
                [canPost]="open()"
                [busy]="busy() === 'message'"
                label="Message to both collectors"
                [closedText]="open() ? null : 'The dispute is decided: the thread is closed.'"
                (send)="postMessage($event)"
              />
            </section>

            <section class="admin-card" aria-labelledby="ad-notes">
              <h2 id="ad-notes">Internal notes</h2>
              <app-moderator-notes
                [notes]="notes()"
                [busy]="busy() === 'note'"
                (add)="addNote($event)"
              />
            </section>
          </div>
          <aside class="ad__side">
            <app-admin-dispute-parties [detail]="d" />
            <section class="admin-card" aria-labelledby="ad-timeline">
              <h2 id="ad-timeline">Dispute timeline</h2>
              <app-dispute-timeline
                [timeline]="dispute.timeline"
                [buyerName]="dispute.buyer.displayName"
                [sellerName]="dispute.seller.displayName"
                [currency]="dispute.payment.currency"
              />
            </section>
            <app-admin-dispute-history [detail]="d" />
          </aside>
        </div>
      } @else {
        <div aria-busy="true" class="ad__loading">
          <span class="visually-hidden">Loading the dispute</span>
          <app-skeleton height="200px" />
          <app-skeleton variant="list" lines="6" />
        </div>
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .ad {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
    }
    .ad__back {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      text-decoration: none;
    }
    .ad__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-3);
    }
    .ad__title {
      margin: 0;
      font-size: var(--font-size-2xl);
    }
    .ad__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
    }
    .ad__grid {
      display: grid;
      grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
      align-items: start;
      gap: var(--spacing-5);
    }
    .ad__main,
    .ad__side,
    .ad__loading {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
      min-width: 0;
    }
    .ad__hint {
      margin-bottom: var(--spacing-3);
    }
    @media (max-width: 1099px) {
      .ad__grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDisputeDetailPageComponent {
  private readonly api = inject(AdminPaymentsService);
  private readonly disputes = inject(DisputesService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly notesView = viewChild(ModeratorNotesComponent);
  private readonly threadView = viewChild(DisputeThreadComponent);

  readonly id = input.required<string>();

  protected readonly detail = signal<AdminDispute | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<Busy>(null);
  protected readonly open = computed(() => isOpenDispute(this.detail()?.dispute.status));
  protected readonly notes = computed<ModeratorNote[]>(() =>
    (this.detail()?.internalNotes ?? []).map((note) => ({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt,
    })),
  );
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      this.detail.set(
        await firstValueFrom(
          this.api.getAdminDispute({ id: this.id() }, 'body', false, { context: silentErrors() }),
        ),
      );
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }

  protected async freeze(): Promise<void> {
    const result = await askReason(this.dialog, {
      title: 'Put this dispute on hold?',
      message:
        'The collectors can no longer add evidence or messages until you lift the hold; the payout stays on hold.',
      confirmLabel: 'Put on hold',
      label: 'Reason (optional, kept as an internal note)',
      required: false,
      maxLength: 500,
    });
    if (!result) {
      return;
    }
    const reason = result.reason.trim();
    await this.write(
      'freeze',
      this.api.freezeDispute(
        { id: this.id(), freezeDisputeRequest: reason ? { reason } : {} },
        'body',
        false,
        { context: silentErrors() },
      ),
      'The dispute is on hold.',
    );
  }

  protected async unfreeze(): Promise<void> {
    const confirmed = await confirmAdminAction(this.dialog, {
      title: 'Lift the hold?',
      message:
        'The collectors can add evidence and messages again. The payout stays on hold until you resolve the dispute.',
      confirmLabel: 'Lift the hold',
    });
    if (!confirmed) {
      return;
    }
    await this.write(
      'unfreeze',
      this.api.unfreezeDispute({ id: this.id() }, 'body', false, { context: silentErrors() }),
      'The hold is lifted.',
    );
  }

  protected async addNote(body: string): Promise<void> {
    const done = await this.write(
      'note',
      this.api.addDisputeNote({ id: this.id(), disputeNoteRequest: { body } }, 'body', false, {
        context: silentErrors(),
      }),
      'Note added.',
    );
    if (done) {
      this.notesView()?.reset();
    }
  }

  protected async postMessage(body: string): Promise<void> {
    this.busy.set('message');
    try {
      await firstValueFrom(
        this.disputes.postDisputeMessage(
          { id: this.id(), disputeMessageRequest: { body } },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.threadView()?.reset();
      this.snackBar.open('Message sent to both collectors.', 'OK', { duration: 4000 });
      await this.load();
    } catch (error) {
      this.snackBar.open(friendlyMessage(toApiError(error)), 'OK', { duration: 7000 });
    } finally {
      this.busy.set(null);
    }
  }

  protected async resolve(): Promise<void> {
    const d = this.detail();
    if (!d) {
      return;
    }
    const payment = d.dispute.payment;
    const context: ResolveContext = {
      currency: payment.currency,
      refundable: refundableOf(payment),
      feePercent: this.feePercentOf(d),
      buyerHandle: d.dispute.buyer.handle,
      sellerHandle: d.dispute.seller.handle,
    };
    const request = await firstValueFrom(
      this.dialog
        .open<ResolveDisputeDialogComponent, ResolveContext, ResolveDisputeRequest>(
          ResolveDisputeDialogComponent,
          { data: context, panelClass: 'app-dialog--md', maxHeight: '92vh' },
        )
        .afterClosed(),
    );
    if (!request) {
      return;
    }
    await this.write(
      'resolve',
      this.api.resolveDispute({ id: this.id(), resolveDisputeRequest: request }, 'body', false, {
        context: silentErrors(),
      }),
      'The dispute is resolved and both collectors were notified.',
    );
  }

  /** The payment's fee percent, from its CREATED event (the platform setting of that moment). */
  private feePercentOf(d: AdminDispute): number {
    const created = d.paymentEvents.find((event) => event.event === 'CREATED');
    const value = Number(created?.details?.['feePercent']);
    return Number.isFinite(value) ? value : 0;
  }

  private async write(
    busy: Exclude<Busy, null>,
    request: Observable<AdminDispute>,
    success: string,
  ): Promise<boolean> {
    this.busy.set(busy);
    const updated = await runAdminAction(
      this.snackBar,
      request,
      success,
      'The dispute changed meanwhile: it was reloaded.',
    );
    this.busy.set(null);
    if (updated) {
      this.detail.set(updated);
      return true;
    }
    await this.load();
    return false;
  }
}
