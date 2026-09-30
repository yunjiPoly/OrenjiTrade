import { HttpClient } from '@angular/common/http';
import {
  EnvironmentProviders,
  Injectable,
  computed,
  inject,
  provideAppInitializer,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppConfig, DEFAULT_APP_CONFIG, normalizeAppConfig } from './app-config.model';

/** Where the runtime configuration is served from (relative to `<base href>`). */
export const APP_CONFIG_URL = 'config.json';

/**
 * Loads `/config.json` once at startup and exposes it as signals.
 * Falls back to {@link DEFAULT_APP_CONFIG} so the app still boots when the file is missing.
 */
@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private readonly http = inject(HttpClient);
  private readonly state = signal<AppConfig>(DEFAULT_APP_CONFIG);
  private readonly loadedState = signal(false);
  private readonly loadErrorState = signal<string | null>(null);
  private resolveLoaded!: () => void;
  private readonly loadedPromise = new Promise<void>((resolve) => (this.resolveLoaded = resolve));

  /** The full configuration (defaults until {@link load} completes). */
  readonly config = this.state.asReadonly();
  /** True once {@link load} has finished, successfully or not. */
  readonly loaded = this.loadedState.asReadonly();
  /** Non-null when `/config.json` could not be loaded and defaults are in use. */
  readonly loadError = this.loadErrorState.asReadonly();

  readonly apiBaseUrl = computed(() => this.state().apiBaseUrl);
  readonly wsBaseUrl = computed(() => this.state().wsBaseUrl);
  readonly environment = computed(() => this.state().environment);
  readonly firebase = computed(() => this.state().firebase);
  readonly googleMapsApiKey = computed(() => this.state().googleMapsApiKey);
  readonly isProduction = computed(() => this.state().environment === 'production');

  /** Fetches the configuration. Never rejects: failures log a warning and keep the defaults. */
  async load(): Promise<AppConfig> {
    try {
      const raw = await firstValueFrom(
        this.http.get<unknown>(APP_CONFIG_URL, {
          headers: { 'Cache-Control': 'no-cache' },
        }),
      );
      this.state.set(normalizeAppConfig(raw));
      this.loadErrorState.set(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.loadErrorState.set(message);
      console.warn(`[OrenjiTrade] ${APP_CONFIG_URL} could not be loaded; using defaults.`, error);
    } finally {
      this.loadedState.set(true);
      this.resolveLoaded();
    }
    return this.state();
  }

  /**
   * Resolves once the configuration is final (after {@link load} finished, successfully or not,
   * or after {@link set} in tests). Services that need the runtime configuration before their first
   * side effect (Firebase initialisation) await this instead of reading the defaults too early.
   */
  whenLoaded(): Promise<AppConfig> {
    return this.loadedPromise.then(() => this.state());
  }

  /** Test/seeding hook: replaces the configuration without a network round trip. */
  set(config: Partial<AppConfig>): void {
    this.state.set(normalizeAppConfig({ ...this.state(), ...config }));
    this.loadedState.set(true);
    this.resolveLoaded();
  }
}

/** Registers the startup loader; add to `ApplicationConfig.providers`. */
export function provideAppConfig(): EnvironmentProviders {
  return provideAppInitializer(() => inject(AppConfigService).load());
}
