import {
  CdkDrag,
  CdkDragEnd,
  CdkDragMove,
  CdkDragPlaceholder,
  CdkDragPreview,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { InventoryItemResponse } from '@orenji/api-client';
import { printingCode, printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { InventoryRow, SelectionChange } from '../items/inventory-row';
import { RowDrag } from '../table/inventory-table.component';

/**
 * Inventory's grid (spec 9.5): `repeat(auto-fill, minmax(136px, 1fr))`, gap 16; each tile has the
 * art (never wider than 160), a lock or globe badge, a checkbox shown on hover, on focus or in
 * selection mode, the name, the code, the price and the copies. A click opens Edit card (in
 * selection mode it selects); Space or x selects; arrows or j/k move; a tile drags to a binder.
 */
@Component({
  selector: 'app-inventory-grid',
  imports: [
    CdkDrag,
    CdkDragPlaceholder,
    CdkDragPreview,
    CdkDropList,
    MatIconModule,
    CardImageComponent,
  ],
  template: `
    <ul
      class="grid"
      role="listbox"
      aria-label="Your cards"
      aria-multiselectable="true"
      [class.grid--selecting]="selectMode()"
      cdkDropList
      cdkDropListSortingDisabled
      [cdkDropListDisabled]="!draggable()"
    >
      @for (row of rows(); track row.item.id; let i = $index) {
        @let it = row.item;
        <li
          class="tile"
          role="option"
          [class.tile--selected]="row.selected"
          [class.tile--new]="row.highlighted"
          [attr.aria-selected]="row.selected"
          [attr.aria-label]="label(row)"
          [attr.data-item-id]="it.id"
          [attr.data-testid]="'inventory-tile-' + it.id"
          [tabindex]="isActive(it.id, i) ? 0 : -1"
          cdkDrag
          [cdkDragData]="it"
          (cdkDragStarted)="dragStarted.emit(it)"
          (cdkDragMoved)="onMove(it, $event)"
          (cdkDragEnded)="onEnd(it, $event)"
          (focus)="activeId.set(it.id)"
          (keydown)="onKey($event)"
          (click)="onClick($event, it, row)"
        >
          <div class="tile__ph" *cdkDragPlaceholder></div>
          <div class="drag-ghost" *cdkDragPreview>
            <span class="drag-ghost__fan">
              @for (art of dragArts().slice(0, 3); track $index) {
                <app-card-image size="fill" [src]="art" />
              }
            </span>
            <span class="drag-ghost__label"
              >{{ dragCount() }} {{ dragCount() === 1 ? 'card' : 'cards' }}</span
            >
          </div>
          <span class="tile__art">
            <app-card-image size="fill" [src]="image(it)" [game]="it.card.game" alt="" />
            <span
              class="tile__badge"
              [class.tile__badge--pending]="row.tag.kind === 'pending'"
              aria-hidden="true"
            >
              <mat-icon>{{ row.tag.icon }}</mat-icon>
            </span>
            <span class="tile__check" [class.tile__check--on]="row.selected" aria-hidden="true">
              <mat-icon>{{ row.selected ? 'check' : '' }}</mat-icon>
            </span>
          </span>
          <span class="tile__name">{{ it.card.name }}</span>
          <span class="tile__code mono">{{ code(it) }}</span>
          <span class="tile__foot">
            <span class="tile__price" [class.tile__price--none]="!row.price">{{
              row.price ?? 'No price'
            }}</span>
            <span class="tile__qty">×{{ it.quantity }}</span>
          </span>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
      gap: 24px 16px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tile {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      padding: 6px;
      border-radius: 12px;
      outline: none;
      cursor: pointer;
    }
    .tile:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    .tile--selected {
      background: var(--color-primary-tint-subtle);
      box-shadow: inset 0 0 0 2px var(--app-primary-text);
    }
    .tile--new {
      background: var(--color-primary-tint);
    }
    .tile__art {
      position: relative;
      display: block;
      max-width: 160px;
      --card-image-radius: 8px;
    }
    .tile:hover .tile__art app-card-image {
      box-shadow: 0 0 0 2px var(--color-border-strong);
    }
    .tile__badge {
      position: absolute;
      top: 6px;
      left: 6px;
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      border-radius: 6px;
      background: rgb(0 0 0 / 0.6);
      color: #fff;
    }
    .tile__badge--pending {
      color: #fbbf24;
    }
    .tile__badge mat-icon,
    .tile__check mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }
    .tile__check {
      position: absolute;
      top: 6px;
      right: 6px;
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border: 2px solid #fff;
      border-radius: 6px;
      background: rgb(0 0 0 / 0.45);
      color: var(--color-on-primary);
      opacity: 0;
    }
    .tile:hover .tile__check,
    .tile:focus-visible .tile__check,
    .grid--selecting .tile__check,
    .tile__check--on {
      opacity: 1;
    }
    .tile__check--on {
      border-color: var(--color-primary);
      background: var(--color-primary);
    }
    .tile__name {
      overflow: hidden;
      color: var(--color-ink);
      font-size: var(--font-size-meta);
      font-weight: var(--font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tile__code {
      color: var(--color-text-secondary);
      font-size: var(--font-size-tag);
    }
    .tile__foot {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      font-size: var(--font-size-meta);
      font-variant-numeric: tabular-nums;
    }
    .tile__price {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .tile__price--none,
    .tile__qty {
      color: var(--color-text-muted);
    }
    .tile__ph {
      min-height: 200px;
      border: 1px dashed var(--color-border-strong);
      border-radius: 12px;
    }
    .drag-ghost {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px 8px 8px;
      border: 1px solid var(--color-border-strong);
      border-radius: 12px;
      background: var(--color-surface-elevated);
      box-shadow: var(--elevation-menu);
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .drag-ghost__fan {
      display: inline-flex;
    }
    .drag-ghost__fan app-card-image {
      --card-image-width: 30px;
      margin-right: -14px;
    }
    .drag-ghost__label {
      margin-left: 16px;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--color-primary);
      color: var(--color-on-primary);
      font-size: var(--font-size-meta);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryGridComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly rows = input.required<readonly InventoryRow[]>();
  readonly selectMode = input(false, { transform: booleanAttribute });
  readonly draggable = input(true, { transform: booleanAttribute });
  readonly dragCount = input(1);
  readonly dragArts = input<readonly (string | null)[]>([]);

  readonly open = output<InventoryItemResponse>();
  readonly selectedChange = output<SelectionChange>();
  readonly toggleAll = output<void>();
  readonly dragStarted = output<InventoryItemResponse>();
  readonly dragMoved = output<RowDrag>();
  readonly dragEnded = output<RowDrag>();
  readonly escape = output<void>();

  protected readonly activeId = signal<string | null>(null);
  private readonly ids = computed(() => this.rows().map((row) => row.item.id));

  protected image(item: InventoryItemResponse): string | null {
    return printingImageUrl(item.printing);
  }

  protected code(item: InventoryItemResponse): string {
    return printingCode(item.printing);
  }

  protected label(row: InventoryRow): string {
    const it = row.item;
    return `${it.card.name}, ${this.code(it)}, ${row.price ?? 'no price'}, ${it.quantity} ${
      it.quantity === 1 ? 'copy' : 'copies'
    }, ${row.tag.label}`;
  }

  protected isActive(id: string, index: number): boolean {
    const active = this.activeId();
    return active !== null && this.ids().includes(active) ? active === id : index === 0;
  }

  protected onClick(event: MouseEvent, item: InventoryItemResponse, row: InventoryRow): void {
    if (this.selectMode() || event.shiftKey || event.metaKey || event.ctrlKey) {
      this.selectedChange.emit({ id: item.id, selected: !row.selected, range: event.shiftKey });
      return;
    }
    this.open.emit(item);
  }

  protected onMove(item: InventoryItemResponse, event: CdkDragMove): void {
    this.dragMoved.emit({ item, pointer: event.pointerPosition });
  }

  protected onEnd(item: InventoryItemResponse, event: CdkDragEnd): void {
    this.dragEnded.emit({ item, pointer: event.dropPoint });
    event.source.reset();
  }

  protected onKey(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.toggleAll.emit();
      return;
    }
    if (mod || event.altKey) {
      return;
    }
    const ids = this.ids();
    const current = this.activeId() ?? ids[0] ?? null;
    const at = current ? ids.indexOf(current) : -1;
    const move = (step: number) => {
      event.preventDefault();
      const next = ids[Math.max(0, Math.min(ids.length - 1, at + step))];
      this.focus(next ?? null);
    };
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'j':
        move(event.key === 'ArrowDown' ? this.columns() : 1);
        return;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'k':
        move(event.key === 'ArrowUp' ? -this.columns() : -1);
        return;
      case 'Enter': {
        event.preventDefault();
        const row = this.rows()[at];
        if (row) {
          this.open.emit(row.item);
        }
        return;
      }
      case ' ':
      case 'x': {
        event.preventDefault();
        const row = this.rows()[at];
        if (row) {
          this.selectedChange.emit({
            id: row.item.id,
            selected: !row.selected,
            range: event.shiftKey,
          });
        }
        return;
      }
      case 'Escape':
        this.escape.emit();
        return;
    }
  }

  focus(id: string | null): void {
    if (!id) {
      return;
    }
    this.activeId.set(id);
    queueMicrotask(() =>
      this.host.nativeElement.querySelector<HTMLElement>(`[data-item-id="${id}"]`)?.focus(),
    );
  }

  /** Tiles per row on screen (↑↓ move by a row). */
  private columns(): number {
    const grid = this.host.nativeElement.querySelector('.grid');
    if (!grid) {
      return 1;
    }
    const template = getComputedStyle(grid).gridTemplateColumns;
    return Math.max(1, template.split(' ').filter(Boolean).length);
  }
}
