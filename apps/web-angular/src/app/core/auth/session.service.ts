import { HttpContext } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  ConsentRequestDocumentTypeEnum,
  ConsentRequestLanguageEnum,
  MeResponse,
  MeService,
  RequiredConsent,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { LegalLanguageService } from '../../features/legal/legal-language.service';
import { ApiError, toApiError } from '../http/api-error';
import { SKIP_ERROR_TOAST, SKIP_SESSION_REDIRECT } from '../http/http-context';
import { AuthService } from './auth.service';
import { Role, hasAdminRole, roleList } from './roles';

/**
 * Where the signed-in collector stands with the API:
 * - `anonymous`: nobody is signed in;
 * - `loading`: `GET /me` has not answered yet for the current user;
 * - `ready`: active account, terms accepted;
 * - `consent-required`: `requiredConsents` is not empty (428 everywhere else);
 *   (a missing 18+ confirmation is not a session state: it is an onboarding step, see
 *   {@link needsOnboarding}, and the API answers 403 `AGE_CONFIRMATION_REQUIRED` on the gated
 *   actions);
 * - `suspended`: 403 `ACCOUNT_SUSPENDED` (or a deleted account);
 * - `deletion-pending`: the owner asked for deletion; only /me, export and cancel work;
 * - `error`: the API could not be reached or failed; retryable.
 */
export type SessionStatus =
  | 'anonymous'
  | 'loading'
  | 'ready'
  | 'consent-required'
  | 'suspended'
  | 'deletion-pending'
  | 'error';

export interface SuspensionInfo {
  message: string;
  /** End of a temporary suspension (ISO timestamp), when the API sent one. */
  until: string | null;
}

/**
 * A legal document version to accept (`POST /me/consents`). The language of the text shown
 * (the active legal language, EN/FR) is recorded with it unless the caller sets one.
 */
export interface ConsentToAccept {
  documentType: string;
  version: string;
  language?: 'en' | 'fr';
}

/** Message the API uses for the 403 of an account whose deletion is pending. */
const DELETION_PENDING_MESSAGE = 'deletion pending';

/** Paths whose own pages handle consent/suspension states (no redirect loops). */
const SESSION_PAGES = /^\/auth(\/|$|\?)/;

function sessionRequestContext(): HttpContext {
  return new HttpContext().set(SKIP_ERROR_TOAST, true).set(SKIP_SESSION_REDIRECT, true);
}

/**
 * The collector's account as the API sees it (`GET /api/v1/me`), exposed as signals.
 *
 * Reloads whenever a different Firebase user signs in and clears on sign-out. Guards call
 * {@link ensureLoaded}; the session interceptor reports 428/403 answers from any other request
 * through {@link handleApiError}, which records the state and routes to the consent or suspended
 * page. It never navigates on its own otherwise.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly auth = inject(AuthService);
  private readonly meApi = inject(MeService);
  private readonly router = inject(Router);
  private readonly legalLanguage = inject(LegalLanguageService);

  private readonly meState = signal<MeResponse | null>(null);
  private readonly statusState = signal<SessionStatus>('anonymous');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly suspensionState = signal<SuspensionInfo | null>(null);
  private readonly pendingConsentsState = signal<RequiredConsent[]>([]);
  private readonly refreshingState = signal(false);

  /** Firebase uid the current state belongs to. */
  private sessionUid: string | null = null;
  private inflight: Promise<SessionStatus> | null = null;
  private generation = 0;

  readonly me = this.meState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly suspension = this.suspensionState.asReadonly();
  /** True while `GET /me` is in flight (initial load or refresh). */
  readonly refreshing = this.refreshingState.asReadonly();

  readonly roles = computed<Role[]>(() => roleList(this.meState()?.roles));
  readonly isAdmin = computed(() => hasAdminRole(this.roles()));
  readonly isSuperAdmin = computed(() => this.roles().includes('SUPER_ADMIN'));
  readonly isModerator = computed(() => this.roles().includes('MODERATOR'));
  /** Admins get the whole console; moderators only its moderation areas. */
  readonly canAccessAdmin = computed(() => this.isAdmin() || this.isModerator());
  readonly handle = computed(() => this.meState()?.handle ?? null);
  readonly displayName = computed(() => {
    const me = this.meState();
    return me?.displayName?.trim() || me?.handle || this.auth.user()?.email || 'Collector';
  });
  /** Documents still to accept, from `/me` or from the last 428 answer. */
  readonly requiredConsents = computed<RequiredConsent[]>(() => {
    const fromMe = this.meState()?.requiredConsents ?? [];
    return fromMe.length > 0 ? fromMe : this.pendingConsentsState();
  });
  /**
   * Profile saved at least once, at least one game or tag chosen, and the 18+ confirmation
   * recorded (`ageConfirmed === false`; an API that does not report the flag never asks for it).
   */
  readonly needsOnboarding = computed(() => {
    const onboarding = this.meState()?.onboarding;
    return (
      !!onboarding &&
      (!onboarding.profileComplete || !onboarding.interestsSet || onboarding.ageConfirmed === false)
    );
  });
  /** The account exists but never confirmed being 18 years of age or older. */
  readonly needsAgeConfirmation = computed(
    () => this.meState()?.onboarding?.ageConfirmed === false,
  );

  constructor() {
    this.auth.changes$.pipe(takeUntilDestroyed()).subscribe((change) => {
      const uid = change.user?.uid ?? null;
      if (uid === this.sessionUid) {
        return; // token refresh for the same user
      }
      this.reset(uid ? 'loading' : 'anonymous');
      this.sessionUid = uid;
      if (uid) {
        void this.load();
      }
    });
  }

  /**
   * Resolves the session status for the current Firebase user, loading `/me` when needed (first
   * time, after an error, or after a user switch).
   */
  async ensureLoaded(): Promise<SessionStatus> {
    await this.auth.ready();
    const user = this.auth.user();
    if (!user) {
      if (this.statusState() !== 'anonymous') {
        this.reset('anonymous');
      }
      return 'anonymous';
    }
    const status = this.statusState();
    if (this.sessionUid === user.uid && status !== 'loading' && status !== 'error') {
      return status;
    }
    return this.load();
  }

  /** (Re)loads `GET /me`. Concurrent calls share one request. Never rejects. */
  load(): Promise<SessionStatus> {
    if (this.inflight) {
      return this.inflight;
    }
    const user = this.auth.user();
    if (!user) {
      this.reset('anonymous');
      return Promise.resolve<SessionStatus>('anonymous');
    }
    this.sessionUid = user.uid;
    const generation = this.generation;
    if (!this.meState() && this.statusState() !== 'suspended') {
      this.statusState.set('loading');
    }
    this.refreshingState.set(true);
    const request = firstValueFrom(
      this.meApi.getMe('body', false, { context: sessionRequestContext() }),
    )
      .then((me) => {
        if (generation === this.generation) {
          this.apply(me);
        }
        return this.statusState();
      })
      .catch((error: unknown) => {
        if (generation === this.generation) {
          this.applyError(toApiError(error));
        }
        return this.statusState();
      })
      .finally(() => {
        if (this.inflight === request) {
          this.inflight = null;
          this.refreshingState.set(false);
        }
      });
    this.inflight = request;
    return request;
  }

  /**
   * Records the consents (with the language the legal texts were shown in) and reloads the
   * session. Rejects with the first {@link ApiError}.
   */
  async acceptConsents(consents: readonly ConsentToAccept[]): Promise<SessionStatus> {
    for (const consent of consents) {
      const documentType = consent.documentType as ConsentRequestDocumentTypeEnum;
      const language = (consent.language ??
        this.legalLanguage.language()) as ConsentRequestLanguageEnum;
      await firstValueFrom(
        this.meApi.acceptConsent(
          { consentRequest: { documentType, version: consent.version, language } },
          'body',
          false,
          { context: sessionRequestContext() },
        ),
      ).catch((error: unknown) => {
        throw toApiError(error);
      });
    }
    this.pendingConsentsState.set([]);
    return this.load();
  }

  /**
   * Called by the session interceptor for API answers that change the account state. Records the
   * state and routes to the page that explains it (unless an auth page is already showing).
   */
  handleApiError(error: ApiError): void {
    if (!this.auth.user()) {
      return;
    }
    if (error.errorCode === 'TERMS_ACCEPTANCE_REQUIRED') {
      const consents = (error.problem?.requiredConsents ?? []).filter(
        (c): c is RequiredConsent => !!c.documentType && !!c.version,
      );
      this.pendingConsentsState.set(consents);
      this.statusState.set('consent-required');
      this.redirect('/auth/consent');
    } else if (error.errorCode === 'ACCOUNT_SUSPENDED') {
      this.applyError(error);
      this.redirect('/auth/suspended');
      if (this.statusState() === 'deletion-pending') {
        void this.load();
      }
    } else if (error.errorCode === 'AGE_CONFIRMATION_REQUIRED') {
      // The onboarding flow records the confirmation; `/me` tells it which step to show.
      this.redirect('/onboarding');
    }
  }

  private apply(me: MeResponse): void {
    this.meState.set(me);
    this.errorState.set(null);
    this.suspensionState.set(null);
    switch (me.status) {
      case 'DELETION_REQUESTED':
        this.statusState.set('deletion-pending');
        break;
      case 'SUSPENDED':
      case 'DELETED':
        this.suspensionState.set({ message: 'This account is suspended.', until: null });
        this.statusState.set('suspended');
        break;
      default:
        this.statusState.set(me.requiredConsents.length > 0 ? 'consent-required' : 'ready');
    }
    if (me.requiredConsents.length === 0) {
      this.pendingConsentsState.set([]);
    }
  }

  private applyError(error: ApiError): void {
    if (error.errorCode === 'ACCOUNT_SUSPENDED') {
      if (
        error.message === DELETION_PENDING_MESSAGE ||
        this.meState()?.status === 'DELETION_REQUESTED'
      ) {
        this.statusState.set('deletion-pending');
        return;
      }
      this.errorState.set(null);
      this.suspensionState.set({
        message: error.message,
        until: error.problem?.suspendedUntil ?? null,
      });
      this.statusState.set('suspended');
      return;
    }
    this.errorState.set(error);
    this.statusState.set('error');
  }

  private redirect(path: string): void {
    const current = this.router.url;
    if (SESSION_PAGES.test(current) || current.startsWith(path)) {
      return;
    }
    void this.router.navigate([path], { queryParams: { returnUrl: current } });
  }

  private reset(status: SessionStatus): void {
    this.generation++;
    this.inflight = null;
    this.sessionUid = null;
    this.refreshingState.set(false);
    this.meState.set(null);
    this.errorState.set(null);
    this.suspensionState.set(null);
    this.pendingConsentsState.set([]);
    this.statusState.set(status);
  }
}
