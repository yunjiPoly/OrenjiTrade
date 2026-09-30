# ADR 0008 — Firebase Authentication / Identity Platform as identity provider

**Status:** Accepted · **Date:** 2026-09-29

## Context
Spec §32 requires a managed identity provider compatible with Google Cloud supporting
email/password, verification, reset, Google and Apple sign-in, with tokens validated by the
backend and no home-grown password handling.

## Decision
Firebase Authentication (upgradable to Identity Platform for MFA/SAML). Clients use the
Firebase SDKs (web `firebase` v12, mobile `firebase` JS SDK under Expo) to sign in and obtain
ID tokens. The API accepts `Authorization: Bearer <idToken>`; `FirebaseIdentityTokenVerifier`
(Firebase Admin SDK) verifies it. Roles, suspension state, terms acceptance and profile data
live in our `user_account` table, keyed by the provider `uid`; the account is provisioned on
first authenticated request. Admin MFA is enforced through Identity Platform MFA + a backend
check of the second-factor claim for ADMIN routes.

Local development runs the Firebase Auth emulator in Docker Compose (`FIREBASE_AUTH_EMULATOR_HOST`);
integration tests use `StaticIdentityTokenVerifier` (profile `test`) which maps
`test-token:<uid>` to identities, so no emulator is needed for the Gradle test suite.

## Consequences
- Password hashing, reset emails, OAuth flows, token refresh and revocation are delegated.
- Apple sign-in is a provider toggle in the Firebase console (required for iOS compliance).
- An `IdentityTokenVerifier` interface keeps a future switch (e.g. Auth0/Keycloak) local to
  the `auth` module.
