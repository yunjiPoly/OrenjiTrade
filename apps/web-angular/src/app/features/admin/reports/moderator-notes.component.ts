import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { ModeratorNote } from '@orenji/api-client';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';

/** Longest moderator note (`AdminReportService.NOTE_MAX`). */
export const MODERATOR_NOTE_MAX = 2000;

/**
 * Internal notes of a report (staff only) with a form to add one. The parent sends the note and
 * calls {@link reset} once it is saved.
 */
@Component({
  selector: 'app-moderator-notes',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    AvatarComponent,
    RelativeTimePipe,
  ],
  template: `
    @if (notes().length === 0) {
      <p class="notes__empty">No notes yet. Notes are visible to moderators and admins only.</p>
    } @else {
      <ol class="notes" aria-label="Moderator notes">
        @for (note of notes(); track note.id) {
          <li class="note">
            <app-avatar
              size="sm"
              [src]="note.author?.avatarUrl"
              [name]="note.author?.displayName ?? 'Staff'"
              [decorative]="true"
            />
            <div class="note__body">
              <p class="note__meta">
                <strong>{{ note.author ? '@' + note.author.handle : 'Staff' }}</strong>
                <time [attr.datetime]="note.createdAt" [title]="note.createdAt | date: 'medium'">
                  {{ note.createdAt | relativeTime }}
                </time>
              </p>
              <p class="note__text">{{ note.body }}</p>
            </div>
          </li>
        }
      </ol>
    }
    <form class="notes__form" (submit)="submit($event)" novalidate>
      <mat-form-field
        appearance="outline"
        class="notes__field"
        subscriptSizing="dynamic"
        hideRequiredMarker
      >
        <mat-label>Add a note</mat-label>
        <textarea matInput [formControl]="body" rows="2" [attr.maxlength]="max"></textarea>
        @if (body.hasError('required') && body.touched) {
          <mat-error>Write the note first.</mat-error>
        }
      </mat-form-field>
      <button matButton="tonal" type="submit" [disabled]="busy() || !hasText()">
        {{ busy() ? 'Saving…' : 'Add note' }}
      </button>
    </form>
  `,
  styles: `
    :host {
      display: block;
    }
    .notes {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      margin: 0 0 var(--spacing-3);
      padding: 0;
      list-style: none;
    }
    .note {
      display: flex;
      gap: var(--spacing-3);
    }
    .note__body {
      flex: 1 1 auto;
      min-width: 0;
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
    }
    .note__meta {
      display: flex;
      gap: var(--spacing-2);
      margin: 0;
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }
    .note__meta strong {
      color: var(--color-ink);
    }
    .note__text {
      margin: 2px 0 0;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    .notes__empty {
      margin: 0 0 var(--spacing-3);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .notes__form {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: var(--spacing-2);
    }
    .notes__field {
      flex: 1 1 260px;
    }
    .notes__form button {
      margin-top: var(--spacing-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModeratorNotesComponent {
  readonly notes = input.required<readonly ModeratorNote[]>();
  readonly busy = input(false);
  readonly add = output<string>();

  protected readonly max = MODERATOR_NOTE_MAX;
  protected readonly body = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(MODERATOR_NOTE_MAX)],
  });
  private readonly value = toSignal(this.body.valueChanges, { initialValue: '' });
  protected readonly hasText = computed(() => this.value().trim().length > 0);

  /** Clears the form after the note was saved. */
  reset(): void {
    this.body.reset('');
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const text = this.body.value.trim();
    if (!text) {
      this.body.markAsTouched();
      return;
    }
    this.add.emit(text);
  }
}
