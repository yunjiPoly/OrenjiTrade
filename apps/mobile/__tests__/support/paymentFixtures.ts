/**
 * The public feature flags of the local seed. Protected payments left the phone (ADR 0018: the API
 * keeps them for the paused web) and Premium, credits, ads and donations left the app (ADR 0019),
 * so no fixture of their endpoints is left here.
 */

/** Every flag the local seed switches on (`protectedPayments` only matters to the paused web). */
export const FLAGS_ON: Record<string, boolean> = {
  protectedPayments: true,
  publicChat: true,
  mlScanning: false,
};

export function flags(overrides: Record<string, boolean> = {}): Record<string, boolean> {
  return { ...FLAGS_ON, ...overrides };
}
