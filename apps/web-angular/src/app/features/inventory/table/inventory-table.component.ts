import {
  CdkDrag,
  CdkDragEnd,
  CdkDragHandle,
  CdkDragMove,
  CdkDragPlaceholder,
  CdkDragPreview,
  CdkDragStart,
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
import { MatMenuModule } from '@angular/material/menu';
import type { BinderResponse, InventoryItemResponse } from '@orenji/api-client';
import { tcgplayerSearchUrl } from '../../../shared/catalog/tcgplayer';
import { printingCode, printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';
import { binderGame, groupBindersByGame } from '../data/binder-games';
import { QUANTITY_MAX, cardFormOf } from '../data/card-form';
import {
  InventoryRow,
  QuantityChange,
  RowAction,
  SelectionChange,
  spokenAge,
} from '../items/inventory-row';
import { VisibilityTagComponent } from '../ui/visibility-tag.component';
import { PriceEditorComponent } from './price-editor.component';

/** The rows being dragged, as the page sees them. */
export interface RowDrag {
  item: InventoryItemResponse;
  pointer: { x: number; y: number };
}

/**
 * Inventory's table (spec 9.4, the default view): 72 px rows with the real art, a sticky 40 px
 * header, `role=grid`. Columns: select, art (hover shows a 160 px preview; drag starts here), card
 * (name, then the game monogram when every game is listed, the mono code and the rarity), binder
 * (a same-game menu), who can see it (click toggles Private and Public), copies (a − n + stepper
 * on hover or focus), price (an inline [$ | % TCG] editor), updated (with a freshness dot) and the
 * "⋯" menu. With the drawer open the row becomes the phone's; at md Binder and Updated drop
 * (container queries). One tab stop: the active row; ↑↓ or j/k move, Enter opens, Space or x
 * selects, Tab enters the row's controls. A row clicked outside its controls opens Edit card.
 */
@Component({
  selector: 'app-inventory-table',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    CdkDragPreview,
    CdkDropList,
    MatIconModule,
    MatMenuModule,
    CardImageComponent,
    GameMonogramComponent,
    PriceEditorComponent,
    VisibilityTagComponent,
  ],
  template: `
    <div
      class="tbl"
      role="grid"
      aria-label="Your cards"
      [attr.aria-rowcount]="rowCount()"
      [attr.aria-multiselectable]="true"
      (keydown)="onKey($event)"
    >
      <div role="rowgroup" class="tbl__head">
        <div role="row" class="tbl__row tbl__row--head" aria-rowindex="1">
          <div role="columnheader" class="c c-sel">
            <input
              type="checkbox"
              class="cb"
              aria-label="Select all loaded cards"
              [checked]="allSelected()"
              [indeterminate]="someSelected() && !allSelected()"
              (change)="toggleAll.emit()"
            />
          </div>
          <div role="columnheader" class="c c-art"><span class="visually-hidden">Picture</span></div>
          <div role="columnheader" class="c c-card">Card</div>
          <div role="columnheader" class="c c-binder">Binder</div>
          <div role="columnheader" class="c c-vis">Who can see it</div>
          <div role="columnheader" class="c c-copies">Copies</div>
          <div role="columnheader" class="c c-price">Price</div>
          <div role="columnheader" class="c c-upd">Updated</div>
          <div role="columnheader" class="c c-menu"><span class="visually-hidden">More</span></div>
        </div>
      </div>
      <div
        role="rowgroup"
        class="tbl__body"
        cdkDropList
        cdkDropListSortingDisabled
        [cdkDropListDisabled]="!draggable()"
      >
        <ng-content select="[tableTop]" />
        @for (row of rows(); track row.item.id; let i = $index) {
          @let it = row.item;
          <div
            role="row"
            class="tbl__row"
            [class.tbl__row--selected]="row.selected"
            [class.tbl__row--busy]="row.busy"
            [class.tbl__row--new]="row.highlighted"
            [class.tbl__row--active]="activeId() === it.id"
            [class.tbl__row--current]="currentId() === it.id"
            [attr.aria-rowindex]="i + 2"
            [attr.aria-selected]="row.selected"
            [attr.data-item-id]="it.id"
            [attr.data-testid]="'inventory-row-' + it.id"
            [tabindex]="isActive(it.id, i) ? 0 : -1"
            cdkDrag
            [cdkDragData]="it"
            (cdkDragStarted)="onDragStart(it, $event)"
            (cdkDragMoved)="onDragMove(it, $event)"
            (cdkDragEnded)="onDragEnd(it, $event)"
            (focusin)="activeId.set(it.id)"
            (click)="onRowClick($event, it)"
          >
            <div class="tbl__placeholder" *cdkDragPlaceholder></div>
            <div class="drag-ghost" *cdkDragPreview>
              <span class="drag-ghost__fan">
                @for (art of ghostArts(); track $index) {
                  <app-card-image size="fill" [src]="art" />
                }
              </span>
              <span class="drag-ghost__label">{{ ghostLabel() }}</span>
            </div>
            <div role="gridcell" class="c c-sel">
              <input
                type="checkbox"
                class="cb"
                [tabindex]="controlTab(it.id, i)"
                [checked]="row.selected"
                [attr.aria-label]="'Select ' + it.card.name"
                (click)="onCheck($event, it)"
              />
            </div>
            <div
              role="gridcell"
              class="c c-art"
              cdkDragHandle
              [cdkDragHandleDisabled]="!draggable()"
              [title]="draggable() ? 'Drag to a binder' : ''"
            >
              <app-card-image class="art" size="fill" [src]="image(it)" [game]="it.card.game" alt="" />
              <span class="art__preview" aria-hidden="true">
                <app-card-image size="fill" [src]="image(it)" [game]="it.card.game" />
              </span>
            </div>
            <div role="gridcell" class="c c-card">
              <span class="name">{{ it.card.name }}</span>
              <span class="line2">
                @if (showGame()) {
                  <app-game-monogram [game]="it.card.game" size="16" />
                }
                <span class="mono code">{{ code(it) }}</span>
                @if (it.printing.rarity) {
                  <span class="rarity">· {{ it.printing.rarity }}</span>
                }
                <app-visibility-tag
                  class="tag-inline"
                  [kind]="row.tag.kind"
                  [label]="row.tag.label"
                  [icon]="row.tag.icon"
                />
              </span>
              <span class="visually-hidden">{{ row.tag.label }}. {{ row.tag.note }}</span>
            </div>
            <div role="gridcell" class="c c-binder">
              <button
                type="button"
                class="cellbtn"
                [tabindex]="controlTab(it.id, i)"
                [class.muted]="!row.binderName"
                [matMenuTriggerFor]="binderMenu"
                [matMenuTriggerData]="{ item: it }"
                [attr.aria-label]="'Binder: ' + (row.binderName ?? 'Unfiled') + '. Change it'"
                (click)="$event.stopPropagation()"
              >
                <span class="cellbtn__text">{{ row.binderName ?? 'Unfiled' }}</span>
                <mat-icon class="chev" aria-hidden="true">expand_more</mat-icon>
              </button>
            </div>
            <div role="gridcell" class="c c-vis">
              <button
                type="button"
                class="cellbtn cellbtn--tag"
                [tabindex]="controlTab(it.id, i)"
                [title]="row.tag.note"
                [attr.aria-label]="
                  'Who can see it: ' + row.tag.label + '. Make it ' + (isPrivate(it) ? 'public' : 'private')
                "
                [disabled]="row.busy"
                (click)="toggleVisibility($event, it)"
              >
                <app-visibility-tag [kind]="row.tag.kind" [label]="row.tag.label" [icon]="row.tag.icon" />
              </button>
            </div>
            <div role="gridcell" class="c c-copies">
              <span class="qty" aria-hidden="true">×{{ it.quantity }}</span>
              <span class="stepper" role="group" [attr.aria-label]="'Copies of ' + it.card.name">
                <button
                  type="button"
                  [tabindex]="controlTab(it.id, i)"
                  [disabled]="row.busy || it.quantity <= 1"
                  [attr.aria-label]="'One less ' + it.card.name"
                  (click)="step($event, it, -1)"
                >
                  <mat-icon aria-hidden="true">remove</mat-icon>
                </button>
                <span class="stepper__n" aria-live="polite">{{ it.quantity }}</span>
                <button
                  type="button"
                  [tabindex]="controlTab(it.id, i)"
                  [disabled]="row.busy || it.quantity >= maxQuantity"
                  [attr.aria-label]="'One more ' + it.card.name"
                  (click)="step($event, it, 1)"
                >
                  <mat-icon aria-hidden="true">add</mat-icon>
                </button>
              </span>
            </div>
            <div role="gridcell" class="c c-price">
              <button
                type="button"
                class="cellbtn cellbtn--price"
                [tabindex]="controlTab(it.id, i)"
                [class.muted]="!row.price"
                [attr.aria-label]="'Asking price: ' + (row.price ?? 'no price') + '. Change it'"
                (click)="openPrice($event, it)"
              >
                <mat-icon class="pen" aria-hidden="true">edit</mat-icon>
                {{ row.price ?? 'No price' }}
              </button>
              @if (editingPrice() === it.id) {
                <app-price-editor
                  [item]="it"
                  (save)="savePrice(it, $event)"
                  (cancel)="closePrice(it)"
                />
              }
            </div>
            <div role="gridcell" class="c c-upd">
              @if (row.dot) {
                <span class="dot" [class.dot--stale]="row.dot === 'stale'" aria-hidden="true"></span>
              }
              <span aria-hidden="true">{{ row.age }}</span>
              <span class="visually-hidden">Updated {{ spoken(row.age) }}{{
                row.dot === 'stale' ? ', needs a confirmation' : row.dot === 'aging' ? ', getting old' : ''
              }}</span>
              @if (row.saved) {
                <mat-icon class="saved" aria-hidden="true">check_circle</mat-icon>
              }
            </div>
            <div role="gridcell" class="c c-menu">
              <button
                type="button"
                class="more"
                [tabindex]="controlTab(it.id, i)"
                [matMenuTriggerFor]="rowMenu"
                [matMenuTriggerData]="{ item: it }"
                [attr.aria-label]="'More for ' + it.card.name"
                [attr.data-testid]="'row-more-' + it.id"
                (click)="$event.stopPropagation()"
              >
                <mat-icon>more_horiz</mat-icon>
              </button>
            </div>
          </div>
        }
        <ng-content select="[tableEnd]" />
      </div>
    </div>

    <mat-menu #binderMenu="matMenu">
      <ng-template matMenuContent let-item="item">
        @for (option of binderOptions(item); track option.id) {
          <button
            mat-menu-item
            type="button"
            role="menuitemradio"
            [attr.aria-checked]="(item.binder?.id ?? null) === option.id"
            (click)="action.emit({ kind: 'move', item, binderId: option.id })"
          >
            <mat-icon>{{ (item.binder?.id ?? null) === option.id ? 'check' : '' }}</mat-icon>
            <span>{{ option.name }}</span>
          </button>
        }
      </ng-template>
    </mat-menu>

    <mat-menu #rowMenu="matMenu">
      <ng-template matMenuContent let-item="item">
        <button mat-menu-item type="button" (click)="action.emit({ kind: 'edit', item })">
          <mat-icon>edit</mat-icon><span>Edit</span>
        </button>
        <button mat-menu-item type="button" [matMenuTriggerFor]="binderMenu" [matMenuTriggerData]="{ item }">
          <mat-icon>drive_file_move</mat-icon><span>Move to binder</span>
        </button>
        <button
          mat-menu-item
          type="button"
          (click)="action.emit({ kind: 'visibility', item, visibility: isPrivate(item) ? 'PUBLIC' : 'PRIVATE' })"
        >
          <mat-icon>{{ isPrivate(item) ? 'public' : 'lock' }}</mat-icon>
          <span>{{ isPrivate(item) ? 'Make public' : 'Make private' }}</span>
        </button>
        <button mat-menu-item type="button" (click)="action.emit({ kind: 'confirm', item })">
          <mat-icon>task_alt</mat-icon><span>Still have it</span>
        </button>
        <a mat-menu-item [href]="tcgplayer(item)" target="_blank" rel="noopener noreferrer">
          <mat-icon>open_in_new</mat-icon><span>Check TCGplayer price ↗</span>
        </a>
        <button mat-menu-item type="button" class="danger" (click)="action.emit({ kind: 'delete', item })">
          <mat-icon>delete</mat-icon><span>Delete</span>
        </button>
      </ng-template>
    </mat-menu>
  `,
  styleUrl: './inventory-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryTableComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly rows = input.required<readonly InventoryRow[]>();
  readonly binders = input<readonly BinderResponse[]>([]);
  readonly allSelected = input(false, { transform: booleanAttribute });
  readonly someSelected = input(false, { transform: booleanAttribute });
  /** Every game is listed: each row shows its game's monogram. */
  readonly showGame = input(true, { transform: booleanAttribute });
  readonly draggable = input(true, { transform: booleanAttribute });
  /** How many cards a drag carries (the selection when the row is part of it). */
  readonly dragCount = input(1);
  readonly dragArts = input<readonly (string | null)[]>([]);
  readonly totalRows = input<number | null>(null);
  /** The card open in the Edit drawer. */
  readonly currentId = input<string | null>(null);

  readonly open = output<InventoryItemResponse>();
  readonly selectedChange = output<SelectionChange>();
  readonly toggleAll = output<void>();
  readonly quantityChange = output<QuantityChange>();
  readonly priceChange = output<{ item: InventoryItemResponse; text: string | null }>();
  readonly action = output<RowAction>();
  readonly dragStarted = output<InventoryItemResponse>();
  readonly dragMoved = output<RowDrag>();
  readonly dragEnded = output<RowDrag>();
  /** Esc with nothing open: the page clears the selection. */
  readonly escape = output<void>();

  protected readonly maxQuantity = QUANTITY_MAX;
  protected readonly activeId = signal<string | null>(null);
  protected readonly editingPrice = signal<string | null>(null);
  protected readonly rowCount = computed(() => (this.totalRows() ?? this.rows().length) + 1);
  protected readonly ghostArts = computed(() => this.dragArts().slice(0, 3));
  protected readonly ghostLabel = computed(() => {
    const count = this.dragCount();
    return `${count} ${count === 1 ? 'card' : 'cards'}`;
  });

  protected image(item: InventoryItemResponse): string | null {
    return printingImageUrl(item.printing);
  }

  protected code(item: InventoryItemResponse): string {
    return printingCode(item.printing);
  }

  protected spoken(age: string): string {
    return spokenAge(age);
  }

  protected tcgplayer(item: InventoryItemResponse): string {
    return tcgplayerSearchUrl(item.card.game, item.card.name);
  }

  protected isPrivate(item: InventoryItemResponse): boolean {
    return cardFormOf(item).visibility === 'PRIVATE';
  }

  /** The active row is the grid's one tab stop (the first row until one is focused). */
  protected isActive(id: string, index: number): boolean {
    const active = this.activeId();
    const known = active !== null && this.rows().some((row) => row.item.id === active);
    return known ? active === id : index === 0;
  }

  protected controlTab(id: string, index: number): number {
    return this.isActive(id, index) ? 0 : -1;
  }

  /** Same-game binders and Unfiled (spec 9.4: "Click: a same-game select"). */
  protected binderOptions(item: InventoryItemResponse): { id: string | null; name: string }[] {
    const sameGame = groupBindersByGame(
      this.binders().filter((binder) => {
        const game = binderGame(binder);
        return !game || game === item.card.game;
      }),
    ).flatMap((group) => group.binders);
    return [
      ...sameGame.map((binder) => ({ id: binder.id as string | null, name: binder.name })),
      { id: null, name: 'Unfiled' },
    ];
  }

  protected onRowClick(event: MouseEvent, item: InventoryItemResponse): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, app-price-editor, .stepper')) {
      return;
    }
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      // Shift+click on a row (outside the checkbox) selects a range too.
      this.selectedChange.emit({
        id: item.id,
        selected: !this.rowOf(item.id)?.selected,
        range: event.shiftKey,
      });
      return;
    }
    this.open.emit(item);
  }

  protected onCheck(event: MouseEvent, item: InventoryItemResponse): void {
    event.stopPropagation();
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedChange.emit({ id: item.id, selected: checked, range: event.shiftKey });
  }

  protected toggleVisibility(event: Event, item: InventoryItemResponse): void {
    event.stopPropagation();
    this.action.emit({
      kind: 'visibility',
      item,
      visibility: this.isPrivate(item) ? 'PUBLIC' : 'PRIVATE',
    });
  }

  protected step(event: Event, item: InventoryItemResponse, direction: 1 | -1): void {
    event.stopPropagation();
    const quantity = Math.min(QUANTITY_MAX, Math.max(1, item.quantity + direction));
    if (quantity !== item.quantity) {
      this.quantityChange.emit({ item, quantity });
    }
  }

  protected openPrice(event: Event, item: InventoryItemResponse): void {
    event.stopPropagation();
    this.editingPrice.set(item.id);
  }

  protected savePrice(item: InventoryItemResponse, text: string | null): void {
    this.editingPrice.set(null);
    this.priceChange.emit({ item, text });
    this.focusPrice(item.id);
  }

  protected closePrice(item: InventoryItemResponse): void {
    this.editingPrice.set(null);
    this.focusPrice(item.id);
  }

  protected onDragStart(item: InventoryItemResponse, _event: CdkDragStart): void {
    this.dragStarted.emit(item);
  }

  protected onDragMove(item: InventoryItemResponse, event: CdkDragMove): void {
    this.dragMoved.emit({ item, pointer: event.pointerPosition });
  }

  protected onDragEnd(item: InventoryItemResponse, event: CdkDragEnd): void {
    this.dragEnded.emit({ item, pointer: event.dropPoint });
    event.source.reset();
  }

  /** The grid's keys (spec 4.9): ↑↓ or j/k, Enter, Space or x, Ctrl/Cmd+A, Esc. */
  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const onRow = target.getAttribute('role') === 'row';
    const inField =
      target instanceof HTMLInputElement && target.type !== 'checkbox' ? true : false;
    if (inField || this.editingPrice()) {
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.toggleAll.emit();
      return;
    }
    if (mod || event.altKey) {
      return;
    }
    const id = this.activeId() ?? this.rows()[0]?.item.id ?? null;
    switch (event.key) {
      case 'ArrowDown':
      case 'j':
        event.preventDefault();
        this.moveFocus(id, 1);
        return;
      case 'ArrowUp':
      case 'k':
        event.preventDefault();
        this.moveFocus(id, -1);
        return;
      case 'Home':
        if (onRow) {
          event.preventDefault();
          this.focusRow(this.rows()[0]?.item.id ?? null);
        }
        return;
      case 'End':
        if (onRow) {
          event.preventDefault();
          this.focusRow(this.rows().at(-1)?.item.id ?? null);
        }
        return;
      case 'Enter':
        if (onRow && id) {
          event.preventDefault();
          const row = this.rowOf(id);
          if (row) {
            this.open.emit(row.item);
          }
        }
        return;
      case ' ':
      case 'x':
        if ((onRow || event.key === 'x') && id) {
          event.preventDefault();
          const row = this.rowOf(id);
          if (row) {
            this.selectedChange.emit({ id, selected: !row.selected, range: event.shiftKey });
          }
        }
        return;
      case 'Escape':
        this.escape.emit();
        return;
    }
  }

  /** Focus a row (after an edit, from the page). */
  focusRow(id: string | null): void {
    if (!id) {
      return;
    }
    this.activeId.set(id);
    queueMicrotask(() =>
      this.host.nativeElement
        .querySelector<HTMLElement>(`[role="row"][data-item-id="${id}"]`)
        ?.focus({ preventScroll: false }),
    );
  }

  private moveFocus(current: string | null, step: 1 | -1): void {
    const ids = this.rows().map((row) => row.item.id);
    const at = current ? ids.indexOf(current) : -1;
    const next = ids[Math.max(0, Math.min(ids.length - 1, at < 0 ? 0 : at + step))];
    this.focusRow(next ?? null);
  }

  private focusPrice(id: string): void {
    queueMicrotask(() =>
      this.host.nativeElement
        .querySelector<HTMLElement>(`[data-item-id="${id}"] .cellbtn--price`)
        ?.focus(),
    );
  }

  private rowOf(id: string): InventoryRow | undefined {
    return this.rows().find((row) => row.item.id === id);
  }
}

