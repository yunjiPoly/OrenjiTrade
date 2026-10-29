import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { PlatformRegion } from '@orenji/api-client';
import { mapCountLine } from '../../map/data/boundaries';
import { WHOLE_REGION } from '../data/search-url';

/** One row of "Browse by state or province". */
export interface StateRow {
  code: string;
  name: string;
  /** "7 binders · 5 deck cores", or '' for a state with none (muted, no text). */
  line: string;
  empty: boolean;
}

export interface StateGroup {
  /** "CANADA" (label style). */
  label: string;
  rows: StateRow[];
}

/** The rows' count line: only the non-zero parts, nothing for a state without binders. */
export function stateLine(total: number | undefined, deckCores: number | undefined): string {
  return total ? mapCountLine(total, deckCores) : '';
}

/** The state list's groups: one per country, in the region's order, states by name. */
export function stateGroups(
  region: PlatformRegion | null,
  counts: ReadonlyMap<string, number>,
  deckCores: ReadonlyMap<string, number>,
): StateGroup[] {
  return (region?.countries ?? []).map((country) => ({
    label: country.name,
    rows: [...country.subdivisions]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((subdivision) => ({
        code: subdivision.code,
        name: subdivision.wholeCountry ? country.name : subdivision.name,
        line: stateLine(counts.get(subdivision.code), deckCores.get(subdivision.code)),
        empty: !counts.get(subdivision.code),
      })),
  }));
}

/**
 * "Browse by state or province" (spec 6.3): the accessible twin of the map that ADR 0017 requires
 * beside it, and the target of "Skip the map". "Whole region" first, the viewer's own province
 * pinned ("Quebec · your province"), then one group per country; 44 rows with "7 binders · 5 deck
 * cores" (map counts are allowed); states with none are muted and carry no text. One tab stop
 * (↑↓, Home, End); hovering or focusing a row outlines its province on the map. Nothing is fetched
 * on hover.
 */
@Component({
  selector: 'app-state-list',
  template: `
    <h2 class="sl__title" [id]="titleId()">Browse by state or province</h2>
    <div class="sl" role="list" [attr.aria-labelledby]="titleId()" (keydown)="onKeydown($event)">
      <div role="listitem">
        <button
          type="button"
          class="sl__row sl__row--whole"
          data-code="all"
          [attr.tabindex]="active() === all ? 0 : -1"
          (click)="picked.emit(all)"
          (focus)="active.set(all)"
        >
          <span class="sl__name">Whole region</span>
          <span class="sl__line">{{ wholeLine() }}</span>
        </button>
      </div>
      @if (homeRow(); as row) {
        <div role="listitem">
          <button
            type="button"
            class="sl__row"
            [class.sl__row--empty]="row.empty"
            [attr.data-code]="row.code"
            [attr.tabindex]="active() === 'home:' + row.code ? 0 : -1"
            (click)="picked.emit(row.code)"
            (focus)="onFocus('home:' + row.code, row.code)"
            (blur)="highlight.emit(null)"
            (mouseenter)="highlight.emit(row.code)"
            (mouseleave)="highlight.emit(null)"
          >
            <span class="sl__name"
              >{{ row.name }} <span class="sl__mine">· your province</span></span
            >
            <span class="sl__line">{{ row.line }}</span>
          </button>
        </div>
      }
      @for (group of groups(); track group.label) {
        <div role="listitem" class="sl__group">
          <h3 class="sl__label">{{ group.label }}</h3>
          <div role="list" [attr.aria-label]="group.label">
            @for (row of group.rows; track row.code) {
              <div role="listitem">
                <button
                  type="button"
                  class="sl__row"
                  [class.sl__row--empty]="row.empty"
                  [attr.data-code]="row.code"
                  [attr.tabindex]="active() === row.code ? 0 : -1"
                  [attr.aria-label]="row.line ? row.name + ', ' + row.line : row.name"
                  (click)="picked.emit(row.code)"
                  (focus)="onFocus(row.code, row.code)"
                  (blur)="highlight.emit(null)"
                  (mouseenter)="highlight.emit(row.code)"
                  (mouseleave)="highlight.emit(null)"
                >
                  <span class="sl__name">{{ row.name }}</span>
                  <span class="sl__line">{{ row.line }}</span>
                </button>
              </div>
            }
          </div>
        </div>
      }
      @if (loading()) {
        @for (bone of [0, 1, 2, 3, 4, 5]; track bone) {
          <span class="sl__bone" aria-hidden="true"></span>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .sl__title {
      margin: 0 0 8px;
      font-size: var(--font-size-section);
      font-weight: var(--font-weight-semibold);
    }
    .sl {
      display: flex;
      flex-direction: column;
    }
    .sl__group {
      margin-top: 12px;
    }
    .sl__label {
      margin: 0;
      padding: 8px 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .sl__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      min-height: 44px;
      padding: 0 12px;
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--color-ink);
      font: inherit;
      font-size: var(--font-size-body);
      text-align: left;
      cursor: pointer;
    }
    .sl__row:hover,
    .sl__row:focus-visible {
      background: var(--color-primary-tint-subtle);
      outline: none;
    }
    .sl__row:focus-visible {
      box-shadow: inset 0 0 0 2px var(--color-accent);
    }
    .sl__row--whole {
      font-weight: var(--font-weight-semibold);
    }
    .sl__row--empty .sl__name {
      color: var(--color-text-muted);
    }
    .sl__mine {
      color: var(--color-accent);
      font-size: var(--font-size-meta);
      font-weight: var(--font-weight-semibold);
    }
    .sl__line {
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
      white-space: nowrap;
    }
    .sl__bone {
      display: block;
      height: 32px;
      margin: 6px 0;
      border-radius: 8px;
      background: var(--color-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StateListComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly region = input<PlatformRegion | null>(null);
  readonly counts = input<ReadonlyMap<string, number>>(new Map());
  readonly deckCores = input<ReadonlyMap<string, number>>(new Map());
  readonly total = input(0);
  readonly deckCoreTotal = input(0);
  readonly home = input<string | null>(null);
  readonly loading = input(false);
  readonly titleId = input('search-state-list-title');
  readonly picked = output<string>();
  readonly highlight = output<string | null>();

  protected readonly all = WHOLE_REGION;
  protected readonly active = signal<string>(WHOLE_REGION);
  protected readonly groups = computed(() =>
    stateGroups(this.region(), this.counts(), this.deckCores()),
  );
  protected readonly homeRow = computed<StateRow | null>(() => {
    const home = this.home();
    if (!home) {
      return null;
    }
    for (const group of this.groups()) {
      const row = group.rows.find((entry) => entry.code === home);
      if (row) {
        return row;
      }
    }
    return null;
  });
  protected readonly wholeLine = computed(() => stateLine(this.total(), this.deckCoreTotal()));

  protected onFocus(key: string, code: string): void {
    this.active.set(key);
    this.highlight.emit(code);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }
    const rows = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.sl__row'));
    const index = rows.indexOf(event.target as HTMLElement);
    if (index < 0) {
      return;
    }
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? rows.length - 1
          : Math.min(Math.max(index + (event.key === 'ArrowDown' ? 1 : -1), 0), rows.length - 1);
    rows[next]?.focus();
  }

  /** "Skip the map" and the empty field land here: the list's tab stop. */
  focus(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.sl__row[tabindex="0"]')?.focus();
  }
}
