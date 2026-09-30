import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import {
  AdminPaymentsService,
  ListPaymentWebhooksRequestParams,
  PageResponsePaymentWebhookEvent,
  PaymentWebhookEvent,
} from '@orenji/api-client';
import { Subscription, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { providerLabel } from '../../../shared/payments/payment-labels';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminChipComponent } from '../shared/admin-chip.component';
import { WEBHOOK_STATUSES, webhookLabel, webhookTone } from './admin-payment-labels';
import { PaymentsSubnavComponent } from './payments-subnav.component';

const PAGE_SIZE = 25;

function toPage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/** Pretty-printed JSON when the payload parses, the raw text otherwise. */
export function formatPayload(payload: string | null | undefined): string {
  if (!payload) {
    return '(empty)';
  }
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

type Payload = { state: 'loading' } | { state: 'ready'; text: string } | { state: 'error' };

/**
 * `/admin/payments/webhooks` (ADMIN): every stored provider webhook, newest first, with status and
 * provider filters (`?status=&provider=&page=`): type, signature check, processing status, the
 * linked payment and the error. "Payload" loads one event's body on demand
 * (`GET /admin/payments/webhooks/{id}`).
 */
@Component({
  selector: 'app-admin-webhooks-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatPaginatorModule,
    MatSelectModule,
    AdminChipComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    PaymentsSubnavComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Payments"
        subtitle="Webhook events the payment provider sent: signatures are checked and each event is applied once."
      />
      <app-payments-subnav>
        <div class="admin-filters" role="search" aria-label="Filter webhook events">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Status</mat-label>
            <mat-select
              [value]="params().status ?? null"
              (selectionChange)="set('status', $event.value)"
            >
              <mat-option [value]="null">Any status</mat-option>
              @for (status of statuses; track status) {
                <mat-option [value]="status">{{ label(status) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Provider</mat-label>
            <mat-select
              [value]="params().provider ?? null"
              (selectionChange)="set('provider', $event.value)"
            >
              <mat-option [value]="null">Any provider</mat-option>
              <mat-option value="fake">Local test provider</mat-option>
              <mat-option value="stripe">Stripe</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        @if (error(); as error) {
          <app-error-state
            title="Webhook events could not load"
            [message]="errorMessage()"
            [requestId]="error.requestId"
            (retry)="reload()"
          />
        } @else if (loading() && !result()) {
          <div aria-busy="true">
            <span class="visually-hidden">Loading webhook events</span>
            <app-skeleton variant="list" lines="6" />
          </div>
        } @else if (result(); as page) {
          @if ((page.items ?? []).length === 0) {
            <app-empty-state icon="webhook" title="No webhook events match" />
          } @else {
            <p class="admin-count" aria-live="polite">
              {{ page.totalItems }} {{ page.totalItems === 1 ? 'event' : 'events' }}
            </p>
            <ul class="hooks" [class.admin-dim]="loading()" aria-label="Webhook events">
              @for (hook of page.items ?? []; track hook.id) {
                <li class="hook" data-testid="webhook-row">
                  <div class="hook__main">
                    <span class="hook__type mono">{{ hook.type }}</span>
                    <app-admin-chip [tone]="tone(hook.status)">{{
                      label(hook.status)
                    }}</app-admin-chip>
                    @if (!hook.signatureValid) {
                      <app-admin-chip tone="danger">Bad signature</app-admin-chip>
                    }
                    <span class="admin-muted">{{ providerName(hook.provider) }}</span>
                    <time class="admin-muted" [title]="hook.receivedAt | date: 'medium'">{{
                      hook.receivedAt | relativeTime
                    }}</time>
                    @if (hook.paymentId) {
                      <a [routerLink]="['/admin/payments', hook.paymentId]">Payment</a>
                    }
                    <button
                      matButton
                      type="button"
                      class="hook__toggle"
                      [attr.aria-expanded]="open() === hook.id"
                      [attr.aria-controls]="'payload-' + hook.id"
                      (click)="toggle(hook)"
                    >
                      <mat-icon aria-hidden="true">{{
                        open() === hook.id ? 'expand_less' : 'data_object'
                      }}</mat-icon>
                      Payload
                    </button>
                  </div>
                  @if (hook.error) {
                    <p class="hook__error">{{ hook.error }}</p>
                  }
                  @if (open() === hook.id) {
                    <div class="hook__payload" [id]="'payload-' + hook.id">
                      @switch (payload().state) {
                        @case ('loading') {
                          <app-skeleton variant="list" lines="3" />
                        }
                        @case ('error') {
                          <p class="admin-muted">The payload could not load.</p>
                        }
                        @default {
                          <pre tabindex="0" aria-label="Webhook payload">{{ payloadText() }}</pre>
                        }
                      }
                    </div>
                  }
                </li>
              }
            </ul>
            @if ((page.totalItems ?? 0) > pageSize) {
              <mat-paginator
                [length]="page.totalItems ?? 0"
                [pageIndex]="page.page ?? 0"
                [pageSize]="pageSize"
                [hidePageSize]="true"
                aria-label="Webhook event pages"
                (page)="onPage($event)"
              />
            }
          }
        }
      </app-payments-subnav>
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .hooks {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      list-style: none;
    }
    .hook {
      padding: var(--spacing-3) var(--spacing-4);
    }
    .hook + .hook {
      border-top: 1px solid var(--color-border);
    }
    .hook__main {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2) var(--spacing-3);
    }
    .hook__type {
      font-weight: var(--font-weight-semibold);
    }
    .hook__toggle {
      margin-left: auto;
    }
    .hook__error {
      margin: var(--spacing-1) 0 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    .hook__payload pre {
      max-height: 320px;
      margin: var(--spacing-2) 0 0;
      padding: var(--spacing-3);
      overflow: auto;
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminWebhooksPageComponent {
  private readonly api = inject(AdminPaymentsService);
  private readonly router = inject(Router);

  readonly status = input<string | undefined>();
  readonly provider = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly statuses = WEBHOOK_STATUSES;
  protected readonly label = webhookLabel;
  protected readonly tone = webhookTone;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly params = computed<ListPaymentWebhooksRequestParams>(() => {
    const status = this.status();
    const provider = this.provider();
    return {
      status: (WEBHOOK_STATUSES as readonly string[]).includes(status ?? '')
        ? (status as ListPaymentWebhooksRequestParams['status'])
        : undefined,
      provider: provider === 'fake' || provider === 'stripe' ? provider : undefined,
      page: toPage(this.page()),
      size: PAGE_SIZE,
    };
  });
  protected readonly result = signal<PageResponsePaymentWebhookEvent | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly open = signal<string | null>(null);
  protected readonly payload = signal<Payload>({ state: 'loading' });
  protected readonly payloadText = computed(() => {
    const payload = this.payload();
    return payload.state === 'ready' ? payload.text : '';
  });

  private subscription: Subscription | null = null;

  constructor() {
    effect(() => {
      const params = this.params();
      untracked(() => this.load(params));
    });
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected providerName(value: string): string {
    return providerLabel(value);
  }

  protected set(key: string, value: string | null): void {
    void this.router.navigate([], {
      queryParams: { [key]: value, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected onPage(event: PageEvent): void {
    void this.router.navigate([], {
      queryParams: { page: event.pageIndex || null },
      queryParamsHandling: 'merge',
    });
  }

  protected reload(): void {
    this.load(this.params());
  }

  protected async toggle(hook: PaymentWebhookEvent): Promise<void> {
    if (this.open() === hook.id) {
      this.open.set(null);
      return;
    }
    this.open.set(hook.id);
    this.payload.set({ state: 'loading' });
    try {
      const detail = await firstValueFrom(
        this.api.getPaymentWebhook({ id: hook.id }, 'body', false, { context: silentErrors() }),
      );
      if (this.open() === hook.id) {
        this.payload.set({ state: 'ready', text: formatPayload(detail.payload) });
      }
    } catch {
      if (this.open() === hook.id) {
        this.payload.set({ state: 'error' });
      }
    }
  }

  private load(params: ListPaymentWebhooksRequestParams): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.subscription = this.api
      .listPaymentWebhooks(params, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(toApiError(error));
          this.loading.set(false);
        },
      });
  }
}
