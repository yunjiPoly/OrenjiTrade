import { HttpContext } from '@angular/common/http';
import {
  EnvironmentProviders,
  Injectable,
  Signal,
  computed,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { FeatureFlagsService as FeatureFlagsApi } from '@orenji/api-client';
import { filter, firstValueFrom, take } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ApiError, toApiError } from '../http/api-error';
import { ATTACH_ID_TOKEN, SKIP_ERROR_TOAST, SKIP_SESSION_REDIRECT } from '../http/http-context';

/**
 * Client-visible flag keys (created by API migrations; see `GET /public/feature-flags`).
 * Unknown keys are allowed: the map from the server is the source of truth.
 */
export const FEATURE = {
  premiumPlans: 'premiumPlans',
  publicChat: 'publicChat',
  protectedPayments: 'protectedPayments',
  advertising: 'advertising',
  donations: 'donations',
  credits: 'credits',
  mlScanning: 'mlScanning',
} as const;

export type KnownFeature = (typeof FEATURE)[keyof typeof FEATURE];

export type FeatureFlagsStatus = 'idle' | 'loading' | 'ready' | 'error';

function flagsRequestContext(): HttpContext {
  return new HttpContext()
    .set(ATTACH_ID_TOKEN, true)
    .set(SKIP_ERROR_TOAST, true)
    .set(SKIP_SESSION_REDIRECT, true);
}

/** Sign-in, sign-up and the other account steps. */
const AUTH_PAGE = /^\/auth(\/|\?|#|$)/;

/**
 * Public feature flags (`GET /api/v1/public/feature-flags`) as signals.
 *
 * Loaded once at startup (after Firebase restored the session, so partial rollouts are evaluated
 * for the signed-in collector) and again whenever a different user signs in or out. A visit that
 * starts on an account page (`/auth/**`) waits: the visitor is about to sign in, so the flags are
 * evaluated for the account right after, or on the first other page. Screens hide
 * what is switched off: {@link isEnabled} is `false` for unknown keys and until the first answer,
 * so a disabled feature never flashes on screen. The API enforces every flag on its own
 * (404 `FEATURE_DISABLED`); this service only shapes the UI.
 */
@Injectable({ providedIn: 'root' })
export class FeatureFlagsService {
  private readonly api = inject(FeatureFlagsApi);
  private readonly auth = inject(AuthService);

  private readonly flagsState = signal<Readonly<Record<string, boolean>>>({});
  private readonly statusState = signal<FeatureFlagsStatus>('idle');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly cache = new Map<string, Signal<boolean>>();
  /** uid the current flags were evaluated for; `undefined` before the first load. */
  private evaluatedFor: string | null | undefined = undefined;
  private generation = 0;
  private inflight: Promise<void> | null = null;
  /** The identity changed while a request was in flight: load again afterwards. */
  private reloadRequested = false;
  /** A first load was requested. */
  private started = false;
  private resolveFirst!: () => void;
  private readonly firstLoad = new Promise<void>((resolve) => (this.resolveFirst = resolve));

  /** Effective flag values from the last successful answer. */
  readonly flags = this.flagsState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly ready = computed(() => this.statusState() === 'ready');

  constructor() {
    this.auth.changes$.pipe(takeUntilDestroyed()).subscribe((change) => {
      const uid = change.user?.uid ?? null;
      if (!this.started) {
        // Waiting on an account page: signing in is the moment to evaluate for the account.
        if (uid) {
          this.start();
        }
        return;
      }
      if (this.evaluatedFor === undefined || uid === this.evaluatedFor) {
        return; // first load still pending (it reads the identity itself) or same user
      }
      if (this.inflight) {
        this.reloadRequested = true;
      } else {
        void this.load();
      }
    });
  }

  /** True when the flag is on for the current visitor (false while unknown). */
  isEnabled(key: string): boolean {
    return this.flagsState()[key] === true;
  }

  /** A memoised signal for templates and computed values. */
  enabled(key: string): Signal<boolean> {
    let flag = this.cache.get(key);
    if (!flag) {
      flag = computed(() => this.flagsState()[key] === true);
      this.cache.set(key, flag);
    }
    return flag;
  }

  /** Resolves once the first load finished (successfully or not); starts it if needed. */
  whenLoaded(): Promise<void> {
    this.start();
    return this.firstLoad;
  }

  /** Starts the first load unless one was already requested. */
  start(): void {
    if (!this.started) {
      void this.load();
    }
  }

  /**
   * (Re)loads the flags for the current identity. Concurrent calls share one request; never
   * rejects. After a failure the previous values stay in place.
   */
  load(): Promise<void> {
    if (this.inflight) {
      return this.inflight;
    }
    this.started = true;
    const generation = ++this.generation;
    this.statusState.set('loading');
    const request = this.auth
      .ready()
      .then(async () => {
        const uid = this.auth.user()?.uid ?? null;
        this.evaluatedFor = uid;
        const flags = await firstValueFrom(
          this.api.getFeatureFlags('body', false, { context: flagsRequestContext() }),
        );
        if (generation === this.generation) {
          this.flagsState.set({ ...(flags ?? {}) });
          this.errorState.set(null);
          this.statusState.set('ready');
        }
      })
      .catch((error: unknown) => {
        if (generation === this.generation) {
          this.errorState.set(toApiError(error));
          this.statusState.set('error');
        }
      })
      .finally(() => {
        if (this.inflight === request) {
          this.inflight = null;
        }
        this.resolveFirst();
        if (this.reloadRequested) {
          this.reloadRequested = false;
          if ((this.auth.user()?.uid ?? null) !== this.evaluatedFor) {
            void this.load();
          }
        }
      });
    this.inflight = request;
    return request;
  }

  /** Test hook: replaces the flags without a request. */
  set(flags: Record<string, boolean>): void {
    this.started = true;
    this.flagsState.set({ ...flags });
    this.statusState.set('ready');
    this.resolveFirst();
  }
}

/**
 * Loads the feature flags on the first navigation outside the account pages (sign-in and sign-up
 * load them right after the visitor signs in), without delaying the first paint.
 */
export function provideFeatureFlags(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const flags = inject(FeatureFlagsService);
      inject(Router)
        .events.pipe(
          filter(
            (event): event is NavigationStart =>
              event instanceof NavigationStart && !AUTH_PAGE.test(event.url),
          ),
          take(1),
        )
        .subscribe(() => flags.start());
    }),
  ]);
}
