import { Routes } from '@angular/router';

/**
 * `/inventory` and `/inventory/import` (web redesign spec 4.11): each its own lazy chunk; CDK
 * drag-drop lives in the Inventory chunk only (spec 21).
 */
export const INVENTORY_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./inventory-page.component').then((m) => m.InventoryPageComponent),
  },
  {
    path: 'import',
    title: 'Import cards',
    loadComponent: () =>
      import('./import/import-page.component').then((m) => m.ImportPageComponent),
  },
];
