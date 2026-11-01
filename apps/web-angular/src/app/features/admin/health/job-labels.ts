/** A scheduled job named and explained (spec 15.7, board A21: never a raw key). */
export interface JobInfo {
  name: string;
  when: string;
  what: string;
  /** Shown only while `protectedPayments` is on (ADR 0018). */
  payments?: boolean;
}

/** Every job the API records in `job_run`, in board A21's order. */
export const JOBS: Readonly<Record<string, JobInfo>> = {
  freshness: {
    name: 'Listing freshness',
    when: 'Every hour',
    what: 'Ages, stales and hides listings nobody confirms.',
  },
  'inventory-import-purge': {
    name: 'Import clean-up',
    when: 'After each freshness run',
    what: 'Deletes expired import previews and results. Never touches inventories.',
  },
  'inventory-photo-purge': {
    name: 'Photo clean-up after deletes',
    when: 'After each freshness run',
    what: 'Deletes the photos of cards deleted more than 10 minutes ago.',
  },
  delist: {
    name: 'Strikes and pauses',
    when: 'Every night',
    what: 'Counts unanswered conversations and pauses listings at the strike limit.',
  },
  'account-deletion': {
    name: 'Account deletion',
    when: 'Every hour',
    what: 'Deletes the accounts whose 7-day deletion window has ended.',
  },
  'upload-cleanup': {
    name: 'Upload clean-up',
    when: 'Every 15 minutes',
    what: 'Deletes chat uploads never attached to a message.',
  },
  ping: {
    name: 'Scheduler ping',
    when: 'When a scheduler checks in',
    what: 'Records that the scheduler can reach the API.',
  },
  'card-images-reconcile': {
    name: 'Card image check',
    when: 'At start-up and on request',
    what: 'Compares the card image cache with its files and frees expired reservations.',
  },
  'card-images-clear': {
    name: 'Card image clearing',
    when: 'On request',
    what: "Removes cached card images, one game's or all, when the clear script runs.",
  },
  'offers-expire': {
    name: 'Offer expiry',
    when: 'Every hour',
    what: 'Expires offers nobody answered (the paused web only).',
    payments: true,
  },
  'payments-auto-release': {
    name: 'Payout release',
    when: 'Every hour',
    what: 'Releases protected payments once their holding time ends.',
    payments: true,
  },
};

/** The order of the jobs table. */
export const JOB_ORDER = Object.keys(JOBS);

/** A job's name, or its key with spaces for a job added later. */
export function jobName(key: string): string {
  return JOBS[key]?.name ?? key.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
