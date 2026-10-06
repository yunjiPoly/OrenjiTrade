import type { Dispute } from '@/src/api/types';
import { isOpenDispute } from '@/src/features/payments/paymentLabels';

/** The other party of a dispute, by display name. */
export function disputeOtherName(
  dispute: Pick<Dispute, 'viewerRole' | 'buyer' | 'seller'>
): string {
  return dispute.viewerRole === 'SELLER' ? dispute.buyer.displayName : dispute.seller.displayName;
}

/** Why evidence or messages cannot be added (web: `DisputePageComponent.closedText`). */
export function disputeClosedText(
  dispute: Pick<Dispute, 'status' | 'canAddEvidence' | 'evidenceLeft'>
): string | null {
  if (dispute.status === 'FROZEN') {
    return 'The dispute is on hold: evidence and messages are paused until OrenjiTrade lifts the hold.';
  }
  if (!isOpenDispute(dispute.status)) {
    return 'The dispute is decided: the thread is closed.';
  }
  if (!dispute.canAddEvidence && dispute.evidenceLeft <= 0) {
    return 'You added the most evidence allowed (10). Use the messages to add details.';
  }
  return null;
}
