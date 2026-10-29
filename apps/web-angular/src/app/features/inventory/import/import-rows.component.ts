import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenu, MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import type {
  InventoryImportResponse,
  InventoryImportRow,
  PrintingSummary,
} from '@orenji/api-client';
import { printingCode, printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { printingVariant } from '../data/printing-variant';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import {
  ROW_STATE_LABEL,
  RowState,
  fileLine,
  rowName,
  rowState,
  unmatchedWhy,
} from './import-labels';

type Section = 'main' | 'extra' | 'side';

/**
 * The lines of an import preview (spec 9.11, board W16): by deck section for a deck file, each
 * with include, the art, the name and its line of the file, the printing (a menu of the printings
 * the file allows, the newest marked), the copies and the status ("Ready", "Which copy?", "Not
 * recognised" with its reason, "Left out").
 */
@Component({
  selector: 'app-import-rows',
  imports: [MatIconModule, MatMenuModule, RouterLink, CardImageComponent],
  templateUrl: './import-rows.component.html',
  styleUrl: './import-rows.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportRowsComponent {
  readonly preview = input.required<InventoryImportResponse>();
  readonly rows = input<readonly InventoryImportRow[]>([]);
  readonly busyRows = input<ReadonlySet<string>>(new Set());
  readonly printings = input<Readonly<Record<string, PrintingSummary[]>>>({});
  readonly working = input(false, { transform: booleanAttribute });
  readonly rowsError = input(false, { transform: booleanAttribute });
  readonly printing = output<{ row: InventoryImportRow; printing: PrintingSummary }>();
  readonly step = output<{ row: InventoryImportRow; direction: 1 | -1 }>();
  readonly include = output<{ row: InventoryImportRow; included: boolean }>();
  readonly includeSection = output<{ key: string; include: boolean }>();
  readonly loadPrintings = output<InventoryImportRow>();
  readonly retry = output<void>();

  protected readonly stateLabel = ROW_STATE_LABEL;
  protected readonly hidden = signal<ReadonlySet<Section>>(new Set());
  private readonly printMenu = viewChild('printMenu', { read: MatMenu });
  /** The row whose printing menu is open while its printings load (A14). */
  private readonly menuRow = signal<InventoryImportRow | null>(null);

  constructor() {
    // The menu opened before its printings arrived: the focus moves to the first one once they do.
    effect(() => {
      const row = this.menuRow();
      const loaded = row?.card ? (this.printings()[row.card.id]?.length ?? 0) > 0 : false;
      if (row && loaded) {
        untracked(() => {
          this.menuRow.set(null);
          setTimeout(() => this.printMenu()?.focusFirstItem('keyboard'));
        });
      }
    });
  }

  protected onMenuOpened(row: InventoryImportRow): void {
    const loaded = row.card ? (this.printings()[row.card.id]?.length ?? 0) > 0 : false;
    this.menuRow.set(loaded ? null : row);
    this.loadPrintings.emit(row);
  }

  protected onMenuClosed(): void {
    this.menuRow.set(null);
  }

  /** Rows by deck section (a deck file), or one group (a CSV). */
  protected readonly groups = computed(() => {
    const rows = this.rows();
    const preview = this.preview();
    if (preview.source !== 'YDK') {
      return [
        { key: 'all', title: null as string | null, rows: [...rows], include: true },
      ];
    }
    const sections = preview.sections;
    // A row lists under the first section that holds its copies (main, extra, then side).
    const sectionOf = (row: InventoryImportRow): Section =>
      (row.deck?.main ?? 0) > 0 ? 'main' : (row.deck?.extra ?? 0) > 0 ? 'extra' : 'side';
    return [
      {
        key: 'main',
        title: 'Main deck',
        include: sections?.includeMain ?? true,
      },
      {
        key: 'extra',
        title: 'Extra deck',
        include: sections?.includeExtra ?? true,
      },
      {
        key: 'side',
        title: 'Side deck',
        include: sections?.includeSide ?? true,
      },
    ]
      .map((group) => ({ ...group, rows: rows.filter((row) => sectionOf(row) === group.key) }))
      .filter((group) => group.rows.length > 0);
  });

  /** The copies the rows shown add (U7: a card of two sections lists once, with all its copies). */
  protected copiesOf(rows: readonly InventoryImportRow[]): number {
    return rows.reduce((total, row) => total + (row.quantity ?? 0), 0);
  }

  /** What tells a printing from its same-code twins among the card's printings (U2), or null. */
  protected variant(row: InventoryImportRow, printing: PrintingSummary): string | null {
    const all = row.card ? (this.printings()[row.card.id] ?? []) : [];
    return printingVariant(printing, all.length ? all : [printing]);
  }

  protected sectionLine(cards: number, copies: number): string {
    return `${cards} ${cards === 1 ? 'card' : 'cards'} · ${copies} ${copies === 1 ? 'copy' : 'copies'}`;
  }

  protected state(row: InventoryImportRow): RowState {
    return rowState(row);
  }

  protected name(row: InventoryImportRow): string {
    return rowName(row);
  }

  protected line(row: InventoryImportRow): string {
    return fileLine(row);
  }

  protected why(row: InventoryImportRow): string {
    return unmatchedWhy(row);
  }

  protected image(row: InventoryImportRow): string | null {
    return printingImageUrl(row.printing) ?? row.card?.imageUrl ?? null;
  }

  protected code(printing: PrintingSummary | null | undefined): string {
    return printingCode(printing);
  }

  protected isBusy(row: InventoryImportRow): boolean {
    return this.busyRows().has(row.id);
  }

  protected sectionHidden(key: string): boolean {
    return this.hidden().has(key as Section);
  }

  protected toggleHidden(key: string): void {
    const next = new Set(this.hidden());
    if (!next.delete(key as Section)) {
      next.add(key as Section);
    }
    this.hidden.set(next);
  }

  /** The printings a row may take (its file narrowed them to `suggestedPrintingIds`), newest first. */
  protected rowPrintings(row: InventoryImportRow): PrintingSummary[] {
    const all = row.card ? (this.printings()[row.card.id] ?? []) : [];
    const suggested = new Set(row.suggestedPrintingIds);
    const narrowed = suggested.size ? all.filter((p) => suggested.has(p.id ?? '')) : all;
    return [...narrowed].sort((a, b) =>
      (b.setReleaseDate ?? '').localeCompare(a.setReleaseDate ?? ''),
    );
  }

  protected newest(row: InventoryImportRow): string | null {
    return this.rowPrintings(row)[0]?.id ?? null;
  }
}
