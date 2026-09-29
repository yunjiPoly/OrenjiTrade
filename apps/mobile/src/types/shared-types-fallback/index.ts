/**
 * Types-only fallback for `@orenji/shared-types` (packages/shared-types), resolved by the
 * tsconfig `paths` entry when that package is absent, and by jest's moduleNameMapper.
 * Mirrors the exported type names of the real package so switching is a no-op.
 */
import type { components, operations, paths } from './schema';

export type { components, operations, paths };

export type Schemas = components['schemas'];
export type MetaResponse = Schemas['MetaResponse'];
export type ProblemDetail = Schemas['ProblemDetail'];

/** Normalised API error shared by web and mobile. */
export interface ApiError {
  errorCode: string;
  message: string;
  requestId: string | null;
  status: number;
  fieldErrors: Record<string, string>;
}

export const REQUEST_ID_HEADER = 'X-Request-Id';
