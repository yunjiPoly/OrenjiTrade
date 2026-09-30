import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import type { DisputeMessage } from '@orenji/api-client';
import { startWith } from 'rxjs';
import { DISPUTE_TEXT_MAX } from './payment-labels';

/**
 * The dispute thread (the two parties and OrenjiTrade support; admins read it too) with a composer
 * (≤ 2000 characters) while posting is allowed; otherwise `closedText` explains why. The parent
 * sends the message and calls {@link reset} once it was posted.
 */
@Component({
  selector: 'app-dispute-thread',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    @if (messages().length === 0) {
      <p class="th__empty">No messages yet.</p>
    } @else {
      <ol class="th" aria-label="Dispute messages">
        @for (message of messages(); track message.id) {
          <li
            class="th__msg"
            [attr.data-role]="message.authorRole"
            [class.th__msg--mine]="message.authorRole === viewer()"
            data-testid="dispute-message"
          >
            <p class="th__author">
              {{ message.authorRole === viewer() ? 'You' : message.authorName }}
              <time [attr.datetime]="message.createdAt">{{
                message.createdAt | date: 'MMM d, h:mm a'
              }}</time>
            </p>
            <p class="th__body">{{ message.body }}</p>
          </li>
        }
      </ol>
    }
    @if (canPost()) {
      <form class="th__composer" (submit)="submit($event)" novalidate>
        <mat-form-field appearance="outline" class="th__field" subscriptSizing="dynamic">
          <mat-label>{{ label() }}</mat-label>
          <textarea
            matInput
            rows="2"
            [formControl]="body"
            [attr.maxlength]="max"
            data-testid="dispute-message-input"
          ></textarea>
          <mat-hint align="end">{{ length() }} / {{ max }}</mat-hint>
          @if (body.invalid && body.touched) {
            <mat-error>{{
              body.hasError('maxlength')
                ? 'Keep it under ' + max + ' characters.'
                : 'Write a message first.'
            }}</mat-error>
          }
        </mat-form-field>
        <button matButton="filled" type="submit" [disabled]="busy()">
          <mat-icon aria-hidden="true">send</mat-icon>
          {{ busy() ? 'Sending…' : 'Send' }}
        </button>
      </form>
    } @else if (closedText()) {
      <p class="th__closed" role="note">
        <mat-icon aria-hidden="true">lock</mat-icon>
        {{ closedText() }}
      </p>
    }
  `,
  styles: `
    .th {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      margin: 0 0 var(--spacing-3);
      padding: 0;
      list-style: none;
    }
    .th__empty {
      margin: 0 0 var(--spacing-3);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .th__msg {
      max-width: min(560px, 92%);
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
    }
    .th__msg--mine {
      align-self: flex-end;
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
    }
    .th__msg[data-role='ADMIN'] {
      border-left: 3px solid var(--color-accent);
      background: var(--color-accent-container);
      color: var(--color-on-accent-container);
    }
    .th__author {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
      margin: 0 0 2px;
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .th__author time {
      font-weight: var(--font-weight-regular);
      opacity: 0.8;
    }
    .th__body {
      margin: 0;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    .th__composer {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-2);
    }
    .th__field {
      flex: 1 1 auto;
    }
    .th__composer button {
      margin-top: 8px;
    }
    .th__closed {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    @media (max-width: 599px) {
      .th__composer {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisputeThreadComponent {
  readonly messages = input.required<readonly DisputeMessage[]>();
  /** The reader's side (`BUYER`, `SELLER` or `ADMIN`). */
  readonly viewer = input<string | null>(null);
  readonly canPost = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });
  readonly label = input('Message');
  /** Why posting is closed (shown instead of the composer). */
  readonly closedText = input<string | null>(null);
  readonly send = output<string>();

  protected readonly max = DISPUTE_TEXT_MAX;
  protected readonly body = new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.maxLength(DISPUTE_TEXT_MAX),
      (control) =>
        typeof control.value === 'string' && control.value.trim() === '' && control.value !== ''
          ? { required: true }
          : null,
    ],
  });
  private readonly value = toSignal(this.body.valueChanges.pipe(startWith('')), {
    initialValue: '',
  });
  protected readonly length = computed(() => this.value().length);

  /** Clears the composer after the message was posted. */
  reset(): void {
    this.body.reset('');
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.body.markAsTouched();
    if (this.body.invalid || this.busy()) {
      return;
    }
    this.send.emit(this.body.value.trim());
  }
}
