import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { SEND_DETAIL_COPY } from '../data/chat-copy';
import { ADDRESS_MAX, DealSide, EMAIL_MAX, isEmail } from '../data/deal-rules';

export type SendDetailKind = 'address' | 'etransfer';

export interface SendDetailData {
  kind: SendDetailKind;
  /** The other collector's handle ("where you and theo.duels can see it"). */
  other: string;
  /** The chat's card or deck core ("theo.duels ships the Yubel core there"), if any. */
  subject: string | null;
  /** The reader's side of the chat: only the buyer's seller ships to the address. */
  side: DealSide;
  /** Sends the message in the chat; resolves the reason it failed, or `null` once it is sent. */
  send: (text: string) => Promise<string | null>;
}

/**
 * "Send my address" and "Send my e-Transfer email" (440, spec 10.3, board W20; decision 9): typed
 * each time and never saved on the web. The text lives in this dialog's signals only (no form
 * state outside it, no draft, no storage, `autocomplete="off"`) and goes straight into the chat
 * with "Send in this chat"; closing the dialog drops it. The preview shows exactly what the other
 * collector will read.
 */
@Component({
  selector: 'app-send-detail-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <div class="sd">
      <header class="sd__head">
        <div>
          <h2 class="sd__title" mat-dialog-title id="send-detail-title">{{ title }}</h2>
          <p class="sd__lead" id="send-detail-desc">{{ lead }}</p>
        </div>
        <button type="button" class="sd__close" aria-label="Close" mat-dialog-close>
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </header>

      @if (isAddress) {
        <label class="sd__field">
          <span class="sd__label">{{ copy.addressLabel }}</span>
          <textarea
            rows="4"
            cdkFocusInitial
            autocomplete="off"
            data-testid="send-detail-input"
            [attr.maxlength]="addressMax"
            [placeholder]="copy.addressPlaceholder"
            [value]="value()"
            (input)="onInput($event)"
            (keydown)="onKeydown($event)"
          ></textarea>
        </label>
      } @else {
        <label class="sd__field">
          <span class="sd__label">{{ copy.etransferLabel }}</span>
          <input
            type="email"
            inputmode="email"
            cdkFocusInitial
            autocomplete="off"
            data-testid="send-detail-input"
            [attr.maxlength]="emailMax"
            [attr.aria-invalid]="showEmailProblem() ? 'true' : null"
            [attr.aria-describedby]="showEmailProblem() ? 'send-detail-problem' : null"
            [placeholder]="copy.etransferPlaceholder"
            [value]="value()"
            (input)="onInput($event)"
            (blur)="touched.set(true)"
            (keydown)="onKeydown($event)"
          />
        </label>
        @if (showEmailProblem()) {
          <p class="sd__problem" id="send-detail-problem">{{ copy.emailInvalid }}</p>
        }
      }

      <p class="sd__note">
        <mat-icon aria-hidden="true">lock</mat-icon>
        <span>{{ copy.notKept(data.other) }}</span>
      </p>

      @if (ready()) {
        <div class="sd__preview" data-testid="send-detail-preview">
          <span class="sd__preview-label">{{ copy.preview(data.other) }}</span>
          <span class="sd__preview-text">{{ message() }}</span>
        </div>
      }

      @if (error(); as error) {
        <p class="sd__problem" role="alert">{{ error }}</p>
      }

      <div class="sd__actions">
        <button matButton="outlined" type="button" mat-dialog-close>{{ copy.cancel }}</button>
        <button
          matButton="filled"
          type="button"
          [disabled]="!ready() || sending()"
          (click)="sendIt()"
        >
          {{ sending() ? copy.sending : copy.send }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .sd {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
      padding: var(--spacing-6);
    }
    .sd__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-3);
    }
    .sd__title {
      margin: 0;
      padding: 0;
      font-family: var(--font-display);
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
    }
    .sd__title::before {
      display: none;
    }
    .sd__lead {
      margin: var(--spacing-1) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .sd__close {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--color-ink);
      cursor: pointer;
    }
    .sd__close:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
    }
    .sd__field {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
    }
    .sd__label {
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .sd__field textarea,
    .sd__field input {
      padding: 10px 12px;
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-input);
      background: var(--color-surface);
      color: var(--color-ink);
      font: inherit;
      resize: vertical;
    }
    .sd__field textarea:focus-visible,
    .sd__field input:focus-visible {
      border-color: var(--color-primary);
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 1px;
    }
    .sd__note {
      display: flex;
      gap: var(--spacing-2);
      margin: 0;
      padding: var(--spacing-3);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .sd__note mat-icon {
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .sd__preview {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
      padding: var(--spacing-3);
      border: 1px dashed var(--color-border-strong);
      border-radius: var(--radius-md);
    }
    .sd__preview-label {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      text-transform: uppercase;
    }
    .sd__preview-text {
      color: var(--color-ink);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .sd__problem {
      margin: 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    .sd__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--spacing-3);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SendDetailDialogComponent {
  protected readonly data = inject<SendDetailData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<SendDetailDialogComponent, boolean>>(MatDialogRef);

  protected readonly copy = SEND_DETAIL_COPY;
  protected readonly isAddress = this.data.kind === 'address';
  protected readonly title = this.isAddress ? this.copy.addressTitle : this.copy.etransferTitle;
  protected readonly lead = this.isAddress
    ? this.copy.addressBody(this.data.other, this.data.subject, this.data.side)
    : this.copy.etransferBody;
  protected readonly addressMax = ADDRESS_MAX;
  protected readonly emailMax = EMAIL_MAX;

  protected readonly value = signal('');
  protected readonly touched = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly ready = computed(() =>
    this.isAddress ? this.value().trim().length > 0 : isEmail(this.value()),
  );
  protected readonly showEmailProblem = computed(
    () => !this.isAddress && this.touched() && !!this.value().trim() && !isEmail(this.value()),
  );
  protected readonly message = computed(() => {
    const text = this.value().trim();
    return this.isAddress ? this.copy.addressMessage(text) : this.copy.etransferMessage(text);
  });

  constructor() {
    // Whatever was typed goes with the dialog.
    this.ref.beforeClosed().subscribe(() => this.value.set(''));
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    this.value.set(target.value.slice(0, this.isAddress ? ADDRESS_MAX : EMAIL_MAX));
    this.error.set(null);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') {
      return;
    }
    // The address takes new lines; Ctrl/Cmd+Enter sends it. The email sends with Enter.
    if (!this.isAddress || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      void this.sendIt();
    }
  }

  protected async sendIt(): Promise<void> {
    if (!this.ready() || this.sending()) {
      this.touched.set(true);
      return;
    }
    this.sending.set(true);
    this.error.set(null);
    try {
      const problem = await this.data.send(this.message());
      if (problem) {
        this.error.set(problem);
        return;
      }
      this.ref.close(true);
    } finally {
      this.sending.set(false);
    }
  }
}
