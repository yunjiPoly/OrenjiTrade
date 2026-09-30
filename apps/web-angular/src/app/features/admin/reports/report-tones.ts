import type { ChipTone } from '../shared/admin-chip.component';

/** Chip tone of a report status in the admin console. */
export function reportStatusTone(status: string | null | undefined): ChipTone {
  switch (status) {
    case 'OPEN':
      return 'warning';
    case 'UNDER_REVIEW':
      return 'info';
    case 'ACTIONED':
      return 'danger';
    case 'DISMISSED':
      return 'success';
    default:
      return 'neutral';
  }
}

/** Chip tone of a resolution action. */
export function resolutionTone(action: string | null | undefined): ChipTone {
  switch (action) {
    case 'WARNING':
      return 'warning';
    case 'LISTINGS_PAUSED':
      return 'info';
    case 'SUSPENDED':
    case 'BANNED':
      return 'danger';
    default:
      return 'neutral';
  }
}
