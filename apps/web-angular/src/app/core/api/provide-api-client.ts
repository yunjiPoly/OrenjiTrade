import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { BASE_PATH, Configuration } from '@orenji/api-client';

/**
 * Wires the generated `@orenji/api-client` services into the application.
 *
 * The generated services build URLs as `${configuration.basePath}/api/v1/...`. We keep the base
 * path empty so every generated call is a relative `/api/...` request; `apiBaseUrlInterceptor`
 * then prefixes it with `AppConfigService.apiBaseUrl()` at request time. That way the runtime
 * configuration from `/config.json` is honoured even for services instantiated before the
 * configuration finished loading, and hand-written calls follow exactly the same path.
 */
export function provideApiClient(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: BASE_PATH, useValue: '' },
    {
      provide: Configuration,
      useFactory: () => new Configuration({ basePath: '', withCredentials: false }),
    },
  ]);
}
