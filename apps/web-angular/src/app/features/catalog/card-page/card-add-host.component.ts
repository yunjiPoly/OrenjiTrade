import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
} from '@angular/core';
import { Router } from '@angular/router';
import { AddCardsDrawerComponent } from '../../inventory/drawer/add-cards-drawer.component';
import { AddManyChoice } from '../../inventory/drawer/add-many.component';
import { InventoryStore } from '../../inventory/data/inventory.store';

/**
 * "I have this card" (spec 7.2, owner decision 16/17, owner check): Inventory's Add cards drawer
 * (stage WB) over the card page, at the printing step, or at the details step when a printing is
 * chosen. A 440 drawer from the top bar down with a scrim (it lies over a reading page at every
 * width; a full-screen sheet below 960). "View" on its "Saved" toast opens the card in
 * Inventory; "Add many" goes to Inventory's quick add rows or Import. A lazy chunk shared with
 * Inventory, loaded on the first click.
 */
@Component({
  selector: 'app-card-add-host',
  imports: [AddCardsDrawerComponent],
  providers: [InventoryStore],
  template: `
    <div class="cah__scrim" aria-hidden="true" (click)="closed.emit()"></div>
    <div class="cah__drawer" data-testid="card-add-drawer">
      <app-add-cards-drawer
        modal
        [startCard]="cardId()"
        [startPrinting]="printingId()"
        (closed)="closed.emit()"
        (many)="onMany($event)"
        (view)="onView($event)"
      />
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 64px 0 0;
      z-index: 900;
    }
    .cah__scrim {
      position: absolute;
      inset: 0;
      background: var(--color-overlay);
    }
    .cah__drawer {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(440px, 100vw);
    }
    @media (max-width: 959.98px) {
      :host {
        inset: 0;
        z-index: 1100;
      }
      .cah__drawer {
        width: 100vw;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardAddHostComponent {
  private readonly store = inject(InventoryStore);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly cardId = input.required<string>();
  readonly printingId = input<string | null>(null);
  readonly closed = output<void>();

  constructor() {
    // The binders of the details step (same-game ones) and the usage line.
    this.store.loadContext();
    const doc = this.host.nativeElement.ownerDocument;
    const previous = doc.body.style.overflow;
    afterNextRender(() => (doc.body.style.overflow = 'hidden'));
    inject(DestroyRef).onDestroy(() => (doc.body.style.overflow = previous));
  }

  protected onView(id: string): void {
    void this.router.navigate(['/inventory'], { queryParams: { item: id } });
  }

  protected onMany(choice: AddManyChoice): void {
    if (choice === 'quick') {
      void this.router.navigate(['/inventory'], { queryParams: { view: 'table', quick: '1' } });
      return;
    }
    void this.router.navigate(['/inventory/import'], {
      queryParams: { source: choice === 'csv' ? 'csv' : 'ydk' },
    });
  }
}
