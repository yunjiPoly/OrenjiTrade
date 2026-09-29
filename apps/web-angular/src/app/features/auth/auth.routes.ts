import { Routes } from '@angular/router';
import { authGuard, guestGuard } from '../../core/auth/auth.guards';

/** `/auth/*`: sign in/up, verification, password reset, consent and account-state pages. */
export const AUTH_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'sign-in' },
  {
    path: 'sign-in',
    title: 'Sign in',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./sign-in/sign-in-page.component').then((m) => m.SignInPageComponent),
  },
  {
    path: 'sign-up',
    title: 'Create account',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./sign-up/sign-up-page.component').then((m) => m.SignUpPageComponent),
  },
  {
    path: 'verify-email',
    title: 'Verify your email',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./verify-email/verify-email-page.component').then((m) => m.VerifyEmailPageComponent),
  },
  {
    path: 'reset-password',
    title: 'Reset password',
    loadComponent: () =>
      import('./reset-password/reset-password-page.component').then(
        (m) => m.ResetPasswordPageComponent,
      ),
  },
  {
    path: 'consent',
    title: 'Review our terms',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./consent/consent-page.component').then((m) => m.ConsentPageComponent),
  },
  {
    path: 'suspended',
    title: 'Account status',
    loadComponent: () =>
      import('./suspended/suspended-page.component').then((m) => m.SuspendedPageComponent),
  },
];
