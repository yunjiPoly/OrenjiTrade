import { CanDeactivateFn, Routes } from '@angular/router';

/** A page that asks "Discard your changes?" for a drawer with unsaved changes before it leaves. */
export interface LeavesDrawer {
  leaveDrawer(): Promise<boolean>;
}

/**
 * Leaving Inventory (the rail, "g h", a link) with unsaved changes in a drawer asks first, as
 * closing the drawer does (spec 9.8, WB review A7).
 */
export const leaveInventoryGuard: CanDeactivateFn<LeavesDrawer> = (page) =>
  page ? page.leaveDrawer() : true;

/**
 * `/inventory` and `/inventory/import` (web redesign spec 4.11): each its own lazy chunk; CDK
 * drag-drop lives in the Inventory chunk only (spec 21).
 */
export const INVENTORY_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canDeactivate: [leaveInventoryGuard],
    loadComponent: () => import('./inventory-page.component').then((m) => m.InventoryPageComponent),
  },
  {
    path: 'import',
    title: 'Import cards',
    loadComponent: () =>
      import('./import/import-page.component').then((m) => m.ImportPageComponent),
  },
];
