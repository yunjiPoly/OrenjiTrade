import type { FeatureFlag } from '@orenji/api-client';

/** A flag in words (board A18): its name, what it does, a note and a lock. */
export interface FlagInfo {
  name: string;
  description: string | null;
  /** A note shown under the flag (ADR 0018 for `protectedPayments`). */
  note: string | null;
  /** Why the switch is locked in the console (`mlScanning`: the owner's hold), or `null`. */
  locked: string | null;
}

const FLAGS: Readonly<Record<string, FlagInfo>> = {
  cardTextScan: {
    name: 'Card text scan',
    description:
      'Scan with camera: the phone reads a Yu-Gi-Oh! card’s name and set code on the device, and OrenjiTrade finds the printing. No photo is uploaded.',
    note: null,
    locked: null,
  },
  publicChat: {
    name: 'Community rooms',
    description:
      'One public room per region and game. Members post text and share a card, a binder or a deck core.',
    note: null,
    locked: null,
  },
  protectedPayments: {
    name: 'Protected payments',
    description: 'Protected payments, shipping and disputes through the payment provider.',
    note: 'The owner keeps it off (ADR 0018). While it is on, Transactions, Disputes and Payments show in this console and on the paused web; the phone never offers protected payments.',
    locked: null,
  },
  mlScanning: {
    name: 'Camera card scanning (ML)',
    description: 'Card recognition from a camera photo through the ML service.',
    note: null,
    locked: 'On hold by the owner. Leave it off until the owner lifts the hold.',
  },
};

/** The board's order: the known flags first, any other by key. */
const ORDER = ['cardTextScan', 'publicChat', 'protectedPayments', 'mlScanning'];

export function flagInfo(flag: Pick<FeatureFlag, 'key' | 'description'>): FlagInfo {
  const key = flag.key ?? '';
  return (
    FLAGS[key] ?? {
      name: key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
      description: flag.description ?? null,
      note: null,
      locked: null,
    }
  );
}

export function sortFlags(flags: readonly FeatureFlag[]): FeatureFlag[] {
  const rank = (key: string | undefined) => {
    const index = ORDER.indexOf(key ?? '');
    return index < 0 ? ORDER.length : index;
  };
  return [...flags].sort(
    (a, b) => rank(a.key) - rank(b.key) || (a.key ?? '').localeCompare(b.key ?? ''),
  );
}

/** A rollout percent: a whole number from 0 to 100, else the error. */
export function rolloutProblem(raw: string): string | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text) || Number(text) > 100) {
    return 'Use a whole number from 0 to 100.';
  }
  return null;
}
