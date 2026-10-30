import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CardImageComponent } from '../../shared/ui/card-image/card-image.component';
import { ShellIconComponent } from '../layout/shell-icon/shell-icon.component';
import { GUEST_COPY, GuestAction, GuestAskSubject, askTitle } from './guest-actions';
import type { GuestAskChoice } from './guest-actions.service';

export interface SignInDialogData {
  action: GuestAction;
  subject: GuestAskSubject | null;
}

/**
 * The sign-in dialog of a guest (spec 14, board W26; 440): the title says what they tried ("Sign
 * in to message this collector"), "It's free. When you're done, you come right back here.", the
 * card or "A collector" it is about (places only), [Create account] (orange), [Sign in] (outline)
 * and "Not now". Esc and the backdrop close it as "Not now". A lazy chunk.
 */
@Component({
  selector: 'app-sign-in-dialog',
  imports: [MatDialogModule, CardImageComponent, ShellIconComponent],
  template: `
    <div class="ask" data-testid="sign-in-dialog">
      <h2 class="ask__title" mat-dialog-title>{{ title }}</h2>
      <p class="ask__text">{{ copy.dialogText }}</p>
      @if (data.subject; as subject) {
        <div class="ask__subject" data-testid="sign-in-dialog-subject">
          @if (subject.kind === 'card') {
            <span class="ask__art" aria-hidden="true">
              <app-card-image size="fill" [src]="subject.imageUrl" [game]="subject.game" alt="" />
            </span>
          } @else {
            <span class="ask__avatar" aria-hidden="true">
              <app-shell-icon name="profile" [size]="20" />
            </span>
          }
          <span class="ask__lines">
            <span class="ask__name">{{ subject.title }}</span>
            <span class="ask__line">{{ subject.line }}</span>
          </span>
        </div>
      }
      <div class="ask__buttons">
        <button type="button" class="ask__btn ask__btn--primary" (click)="choose('sign-up')">
          {{ copy.createAccount }}
        </button>
        <button type="button" class="ask__btn ask__btn--outline" (click)="choose('sign-in')">
          {{ copy.signIn }}
        </button>
        <button type="button" class="ask__quiet" (click)="choose(undefined)">
          {{ copy.notNow }}
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .ask {
      display: flex;
      flex-direction: column;
      padding: 28px 28px 16px;
    }
    .ask__title {
      margin: 0;
      padding: 0;
      color: var(--color-ink);
      font-family: var(--font-display);
      font-size: 20px;
      font-weight: var(--font-weight-semibold);
      line-height: 28px;
      letter-spacing: -0.2px;
    }
    .ask__title::before {
      display: none;
    }
    .ask__text {
      margin: 8px 0 0;
      color: var(--color-text-muted);
      font-size: 15px;
      line-height: 22px;
    }
    .ask__subject {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 20px;
      padding: 12px;
      border: 1px solid var(--color-border);
      border-radius: 14px;
      background: var(--color-background);
    }
    .ask__art {
      display: block;
      flex: none;
      width: 40px;
      height: 58px;
      overflow: hidden;
      border-radius: 5px;
    }
    .ask__avatar {
      display: grid;
      flex: none;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
    }
    .ask__lines {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .ask__name {
      overflow: hidden;
      color: var(--color-ink);
      font-size: 15px;
      font-weight: var(--font-weight-semibold);
      line-height: 22px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ask__line {
      color: var(--color-text-muted);
      font-size: 13px;
      line-height: 18px;
    }
    .ask__buttons {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 24px;
    }
    .ask__btn {
      height: 52px;
      border: 0;
      border-radius: var(--radius-pill);
      font: inherit;
      font-size: 16px;
      font-weight: var(--font-weight-bold);
      cursor: pointer;
    }
    .ask__btn--primary {
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .ask__btn--primary:hover {
      background: var(--color-primary-hover);
    }
    .ask__btn--outline {
      border: 1px solid var(--color-border-strong);
      background: transparent;
      color: var(--color-ink);
      font-size: 15px;
      font-weight: var(--font-weight-semibold);
    }
    .ask__btn--outline:hover {
      background: var(--color-surface-variant);
    }
    .ask__quiet {
      height: 44px;
      border: 0;
      border-radius: var(--radius-pill);
      background: none;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .ask__quiet:hover {
      background: var(--color-surface-variant);
      color: var(--color-ink);
    }
    .ask__btn:focus-visible,
    .ask__quiet:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInDialogComponent {
  protected readonly data = inject<SignInDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<SignInDialogComponent, GuestAskChoice>>(MatDialogRef);

  protected readonly copy = GUEST_COPY;
  protected readonly title = askTitle(this.data.action);

  protected choose(choice: GuestAskChoice): void {
    this.ref.close(choice);
  }
}
