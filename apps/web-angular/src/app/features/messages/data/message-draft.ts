import { SendMessageRequest, SendMessageRequestKindEnum } from '@orenji/api-client';
import type { BinderLinkChoice, CardLinkChoice } from '../../../shared/links/link-choices';
import type { OfferLinkChoice } from '../../../shared/offers/offer-link-picker.component';
import { MESSAGE_MAX_LENGTH } from './message-text';

/** Photo limit of `POST /uploads/images` (the server re-encodes and strips metadata). */
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

export type DraftAttachment =
  | { kind: 'card'; card: CardLinkChoice }
  | { kind: 'binder'; binder: BinderLinkChoice }
  | { kind: 'offer'; offer: OfferLinkChoice }
  | { kind: 'image'; file: File; previewUrl: string };

/** What the composer hands to the thread when the collector presses Send. */
export interface MessageDraft {
  text: string;
  attachment: DraftAttachment | null;
}

/** Why a photo cannot be attached, or `null` when it can. */
export function imageProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return 'Use a JPEG, PNG or WebP photo.';
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return 'Choose a photo up to 8 MB.';
  }
  if (file.size === 0) {
    return 'This file is empty.';
  }
  return null;
}

/** Why the draft cannot be sent yet, or `null`. */
export function draftProblem(draft: MessageDraft): string | null {
  const text = draft.text.trim();
  if (!text && !draft.attachment) {
    return 'Write a message or attach something.';
  }
  if (draft.text.length > MESSAGE_MAX_LENGTH) {
    return `Messages are limited to ${MESSAGE_MAX_LENGTH} characters.`;
  }
  return null;
}

/** The request for a draft (the photo's upload id is added once it is uploaded). */
export function sendRequest(draft: MessageDraft, imageUploadId?: string): SendMessageRequest {
  const text = draft.text.trim();
  const body = text || undefined;
  const attachment = draft.attachment;
  switch (attachment?.kind) {
    case 'card':
      return {
        kind: SendMessageRequestKindEnum.CardLink,
        body,
        cardPrintingId: attachment.card.printingId,
      };
    case 'binder':
      return {
        kind: SendMessageRequestKindEnum.BinderLink,
        body,
        binderId: attachment.binder.binderId,
      };
    case 'offer':
      return {
        kind: SendMessageRequestKindEnum.OfferLink,
        body,
        offerId: attachment.offer.offerId,
      };
    case 'image':
      return { kind: SendMessageRequestKindEnum.Image, body, imageUploadId };
    default:
      return { kind: SendMessageRequestKindEnum.Text, body: text };
  }
}
