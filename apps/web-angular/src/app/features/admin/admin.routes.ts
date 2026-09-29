import { Routes } from '@angular/router';

/** `/admin` console: shell with side navigation, dashboard as the only live section for now. */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Admin',
        loadComponent: () =>
          import('./admin-dashboard.component').then((m) => m.AdminDashboardComponent),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
