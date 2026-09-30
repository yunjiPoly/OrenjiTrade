import { Routes } from '@angular/router';
import { LEGAL_DOCUMENT_LIST } from './legal-content';

/** `/legal` index plus one route per document, all rendered by `LegalPageComponent`. */
export const LEGAL_ROUTES: Routes = [
  {
    path: '',
    title: 'Legal',
    loadComponent: () => import('./legal-index.component').then((m) => m.LegalIndexComponent),
  },
  ...LEGAL_DOCUMENT_LIST.map((doc) => ({
    path: doc.key,
    title: doc.title,
    data: { key: doc.key },
    loadComponent: () => import('./legal-page.component').then((m) => m.LegalPageComponent),
  })),
];
