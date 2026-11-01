import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminWishlistService, WishlistSettingsResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminIconComponent } from '../console/admin-icon.component';
import { runConsoleAction } from '../console/console-actions';
import { changedLine } from '../console/editor-line';

/** A price term label: a percent (1-200) and "% TCG", with an optional "+". */
export const PRICE_TERM = /^([1-9]\d{0,2})% TCG(\+)?$/;

export const MAX_TERMS = 10;

/** The terms of a comma- or line-separated text, trimmed, duplicates dropped, order kept. */
export function parseTerms(text: string): string[] {
  const terms: string[] = [];
  for (const part of text.split(/[\n,]/)) {
    const term = part.trim();
    if (term && !terms.includes(term)) {
      terms.push(term);
    }
  }
  return terms;
}

/** The first invalid term, or a count problem; `null` when the list can be saved. */
export function termsProblem(terms: readonly string[]): string | null {
  for (const term of terms) {
    const match = PRICE_TERM.exec(term);
    if (!match || Number(match[1]) > 200) {
      return `"${term}" is not a term like "85% TCG" or "100% TCG+" (percent 1-200).`;
    }
  }
  if (terms.length === 0 || terms.length > MAX_TERMS) {
    return `Keep between 1 and ${MAX_TERMS} terms.`;
  }
  return null;
}

/** Why a typed term cannot be added (board A16's "Add a term"), or `null`. */
export function addTermProblem(raw: string, terms: readonly string[]): string | null {
  const term = normalizeTerm(raw);
  if (!term) {
    return 'Type a term first.';
  }
  const match = PRICE_TERM.exec(term);
  if (!match || Number(match[1]) > 200) {
    return 'A percent from 1 to 200, then “% TCG”, with an optional “+” for “or more”.';
  }
  if (terms.includes(term)) {
    return `${term} is already in the list.`;
  }
  if (terms.length >= MAX_TERMS) {
    return `At most ${MAX_TERMS} terms.`;
  }
  return null;
}

/** "85 % tcg +" → "85% TCG+": a typed term in the stored form. */
export function normalizeTerm(raw: string): string {
  const match = /^\s*(\d{1,3})\s*%?\s*(?:tcg)?\s*(\+)?\s*$/i.exec(raw);
  return match ? `${Number(match[1])}% TCG${match[2] ? '+' : ''}` : raw.trim();
}

/** What a seller reads for a term (board A16): "about 85% of the TCG market price". */
export function sellersRead(term: string): string {
  const match = PRICE_TERM.exec(term);
  if (!match) {
    return term;
  }
  const percent = Number(match[1]);
  const base =
    percent === 100 ? 'the TCG market price' : `about ${percent}% of the TCG market price`;
  return match[2] ? `${base} or more` : base;
}

/**
 * `/admin/wishlist` (spec 15.7, board A16; ADMIN, SUPER_ADMIN): the price terms a wish may show
 * (platform setting `wishlist.price_terms`, ADR 0014; `PUT /admin/wishlist/settings`, audited
 * `wishlist.settings.update`) as an ordered list: drag or move buttons, remove, "Add a term".
 * Terms are display terms for sellers, relative to the TCG market price, never a filter; wishes
 * that chose a removed term keep it; no amount is ever shown.
 */
@Component({
  selector: 'app-admin-wishlist-settings-page',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    AdminIconComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './admin-wishlist-settings-page.component.html',
  styleUrls: [
    '../console/console-page.scss',
    '../console/console-controls.scss',
    './admin-wishlist-settings-page.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminWishlistSettingsPageComponent {
  private readonly api = inject(AdminWishlistService);
  private readonly toasts = inject(ToastService);
  private readonly document = inject(DOCUMENT);

  protected readonly settings = signal<WishlistSettingsResponse | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly saving = signal(false);
  protected readonly terms = signal<string[]>([]);
  protected readonly draft = signal('');
  protected readonly addError = signal<string | null>(null);
  protected readonly announcement = signal('');
  protected readonly maxTerms = MAX_TERMS;
  protected readonly sellersRead = sellersRead;
  protected readonly problem = computed(() => termsProblem(this.terms()));
  protected readonly changed = computed(
    () => this.terms().join('\n') !== (this.settings()?.priceTerms ?? []).join('\n'),
  );
  protected readonly editor = computed(() => changedLine(this.settings()));
  /** The preview's chosen term (board A16: the wish row shows one). */
  protected readonly previewTerm = computed(() => this.terms()[1] ?? this.terms()[0] ?? null);

  constructor() {
    void this.load();
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      const settings = await firstValueFrom(
        this.api.getAdminWishlistSettings('body', false, { context: silentErrors() }),
      );
      this.apply(settings);
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }

  protected reset(): void {
    this.terms.set([...(this.settings()?.priceTerms ?? [])]);
    this.addError.set(null);
  }

  protected onDraft(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
    this.addError.set(null);
  }

  protected add(): void {
    const problem = addTermProblem(this.draft(), this.terms());
    if (problem) {
      this.addError.set(problem);
      this.document.getElementById('wt-add')?.focus();
      return;
    }
    const term = normalizeTerm(this.draft());
    this.terms.update((terms) => [...terms, term]);
    this.draft.set('');
    this.announcement.set(`${term} added at position ${this.terms().length}.`);
  }

  protected remove(index: number): void {
    const term = this.terms()[index];
    this.terms.update((terms) => terms.filter((_, i) => i !== index));
    this.announcement.set(`${term} removed.`);
    const next = Math.min(index, this.terms().length - 1);
    setTimeout(() =>
      this.document.getElementById(next >= 0 ? `wt-remove-${next}` : 'wt-add')?.focus(),
    );
  }

  /** The move buttons (and Alt+arrows on a row): the keyboard path of the drag. */
  protected move(index: number, delta: number): void {
    const to = index + delta;
    if (to < 0 || to >= this.terms().length) {
      return;
    }
    const terms = [...this.terms()];
    moveItemInArray(terms, index, to);
    this.terms.set(terms);
    this.announcement.set(`${terms[to]} moved to position ${to + 1} of ${terms.length}.`);
    setTimeout(() =>
      this.document.getElementById(`wt-${delta < 0 ? 'up' : 'down'}-${to}`)?.focus(),
    );
  }

  protected drop(event: CdkDragDrop<string[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    const terms = [...this.terms()];
    moveItemInArray(terms, event.previousIndex, event.currentIndex);
    this.terms.set(terms);
    this.announcement.set(
      `${terms[event.currentIndex]} moved to position ${event.currentIndex + 1} of ${terms.length}.`,
    );
  }

  protected async save(): Promise<void> {
    if (this.problem() || this.saving() || !this.changed()) {
      return;
    }
    this.saving.set(true);
    const saved = await runConsoleAction(
      this.toasts,
      this.api.updateAdminWishlistSettings(
        { updateWishlistSettingsRequest: { priceTerms: this.terms() } },
        'body',
        false,
        { context: silentErrors() },
      ),
      'Price terms saved.',
    );
    this.saving.set(false);
    if (saved) {
      this.apply(saved);
    }
  }

  private apply(settings: WishlistSettingsResponse): void {
    this.settings.set(settings);
    this.terms.set([...(settings.priceTerms ?? [])]);
  }
}
