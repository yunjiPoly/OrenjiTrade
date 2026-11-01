import { Routes } from '@angular/router';
import { authGuard, guestGuard } from '../../core/auth/auth.guards';

/**
 * `/auth/*`: sign in and up, verification, password reset, and the account states (Review our
 * terms, suspended or scheduled for deletion, could not load). Bare pages (spec 14: no rail).
 */
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
    // "We could not load your account" (spec 14, an account state).
    path: 'unavailable',
    title: 'We could not load your account',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./unavailable/unavailable-page.component').then((m) => m.UnavailablePageComponent),
  },
  {
    path: 'suspended',
    title: 'Account status',
    loadComponent: () =>
      import('./suspended/suspended-page.component').then((m) => m.SuspendedPageComponent),
  },
];
