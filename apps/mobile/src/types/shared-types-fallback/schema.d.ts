/**
 * Minimal fallback for `@orenji/shared-types` (packages/shared-types), used only when that
 * package is absent. Mirrors docs/api/openapi.json for the endpoints the app calls today.
 * Shape follows openapi-typescript output so swapping to the real package is a no-op.
 */
export interface paths {
  '/api/v1/meta': {
    get: {
      responses: {
        200: {
          content: {
            'application/json': components['schemas']['MetaResponse'];
          };
        };
      };
    };
  };
}

export interface components {
  schemas: {
    MetaResponse: {
      name: string;
      version: string;
      environment: string;
      /** Format: date-time */
      serverTime: string;
    };
    ProblemDetail: {
      /** Format: uri */
      type?: string;
      title?: string;
      status?: number;
      detail?: string;
      instance?: string;
      errorCode?: string;
      message?: string;
      requestId?: string;
      /** Format: date-time */
      timestamp?: string;
      errors?: {
        field?: string;
        message?: string;
      }[];
    };
  };
}

export type operations = Record<string, never>;
