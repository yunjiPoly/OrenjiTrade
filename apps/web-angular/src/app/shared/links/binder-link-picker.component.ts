import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
  MatAutocompleteTrigger,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { BinderResponse, BindersService } from '@orenji/api-client';
import { silentErrors } from '../../core/http/http-context';
import { BinderLinkChoice } from './link-choices';

type LoadState = 'loading' | 'ready' | 'error';

/** Public binders of the caller whose name contains `text` (case and accent insensitive). */
export function matchingBinders(
  binders: readonly BinderResponse[],
  text: string,
): BinderResponse[] {
  const fold = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const needle = fold(text.trim());
  return binders.filter(
    (binder) => binder.effectivePublic && (!needle || fold(binder.name).includes(needle)),
  );
}

/**
 * "Share a binder": one of the caller's public binders (`GET /binders`, only binders that are
 * public right now can be linked) picked through an autocomplete on its name.
 */
@Component({
  selector: 'app-binder-link-picker',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <div class="picker">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="picker__field">
        <mat-icon matPrefix aria-hidden="true">menu_book</mat-icon>
        <mat-label>Binder to share</mat-label>
        <input
          #field
          matInput
          type="text"
          [formControl]="query"
          [matAutocomplete]="panel"
          (keydown.escape)="onEscape()"
          placeholder="Name of one of your public binders"
          maxlength="80"
          autocomplete="off"
        />
        <button
          matSuffix
          matIconButton
          type="button"
          aria-label="Cancel sharing a binder"
          (click)="cancelled.emit()"
        >
          <mat-icon>close</mat-icon>
        </button>
      </mat-form-field>
      @switch (state()) {
        @case ('error') {
          <p class="picker__note picker__note--error" role="alert">
            Your binders could not load.
            <button matButton type="button" (click)="load()">Retry</button>
          </p>
        }
        @case ('ready') {
          @if (publicCount() === 0) {
            <p class="picker__note">
              You have no public binder yet.
              <a routerLink="/inventory">Publish one from your inventory</a>.
            </p>
          }
        }
      }
    </div>

    <mat-autocomplete
      #panel="matAutocomplete"
      [displayWith]="displayWith"
      (optionSelected)="onSelected($event)"
    >
      @if (state() === 'loading') {
        <mat-option disabled>Loading your binders…</mat-option>
      }
      @for (binder of options(); track binder.id) {
        <mat-option [value]="binder">
          <span class="picker-option">
            <mat-icon aria-hidden="true">menu_book</mat-icon>
            <span class="picker-option__text">
              <span class="picker-option__name">{{ binder.name }}</span>
              <span class="picker-option__meta">
                {{ binder.publicItemCount }}
                {{ binder.publicItemCount === 1 ? 'public card' : 'public cards' }}
              </span>
            </span>
          </span>
        </mat-option>
      }
      @if (state() === 'ready' && publicCount() > 0 && options().length === 0) {
        <mat-option disabled>No public binder matches.</mat-option>
      }
    </mat-autocomplete>
  `,
  styles: `
    :host {
      display: block;
    }
    .picker__field {
      width: 100%;
    }
    .picker__note {
      margin: var(--spacing-1) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .picker__note--error {
      color: var(--color-danger);
    }
    .picker-option {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
    }
    .picker-option__text {
      display: flex;
      flex-direction: column;
      line-height: 1.25;
    }
    .picker-option__name {
      font-weight: var(--font-weight-medium);
    }
    .picker-option__meta {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BinderLinkPickerComponent {
  private readonly api = inject(BindersService);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly trigger = viewChild(MatAutocompleteTrigger);

  readonly picked = output<BinderLinkChoice>();
  readonly cancelled = output<void>();

  protected readonly query = new FormControl<string | BinderResponse>('', { nonNullable: true });
  private readonly text = toSignal(this.query.valueChanges, { initialValue: '' });
  protected readonly state = signal<LoadState>('loading');
  private readonly binders = signal<BinderResponse[]>([]);
  protected readonly publicCount = computed(() => matchingBinders(this.binders(), '').length);
  protected readonly options = computed(() => {
    const text = this.text();
    return matchingBinders(this.binders(), typeof text === 'string' ? text : '');
  });

  constructor() {
    this.load();
    afterNextRender(() => this.field()?.nativeElement.focus());
  }

  protected load(): void {
    this.state.set('loading');
    this.api.listMyBinders('body', false, { context: silentErrors() }).subscribe({
      next: (binders) => {
        this.binders.set(binders ?? []);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  /** Escape closes the suggestions first, then cancels the picker. */
  protected onEscape(): void {
    if (!this.trigger()?.panelOpen) {
      this.cancelled.emit();
    }
  }

  protected readonly displayWith = (value: string | BinderResponse | null): string =>
    !value ? '' : typeof value === 'string' ? value : value.name;

  protected onSelected(event: MatAutocompleteSelectedEvent): void {
    const binder = event.option.value as BinderResponse;
    this.picked.emit({ binderId: binder.id, name: binder.name, itemCount: binder.publicItemCount });
  }
}
