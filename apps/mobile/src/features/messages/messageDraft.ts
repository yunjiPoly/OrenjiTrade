import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import type { SendMessageRequest } from '@/src/api/types';

import { MESSAGE_MAX_LENGTH } from './messageText';

/** Photo limit of `POST /uploads/images` (the server re-encodes and strips metadata). */
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

/** A printing chosen to share in a message or a community post (`cardPrintingId`). */
export interface CardLinkChoice {
  printingId: string;
  cardId: string;
  name: string;
  printingCode: string | null;
  imageUrl: string | null;
  game: string | null;
}

/** One of the caller's public binders chosen to share (`binderId`). */
export interface BinderLinkChoice {
  binderId: string;
  name: string;
  itemCount: number;
}

/** A photo picked from the library (`expo-image-picker` asset). */
export interface PickedPhoto {
  uri: string;
  mimeType: string;
  fileName: string;
  /** Bytes, when the platform reports it. */
  size: number | null;
  width: number | null;
  height: number | null;
  /** Web only: the browser `File`. */
  file?: Blob | null;
}

export type DraftAttachment =
  | { kind: 'card'; card: CardLinkChoice }
  | { kind: 'binder'; binder: BinderLinkChoice }
  | { kind: 'image'; photo: PickedPhoto };

/** What the composer hands to the thread when the collector presses Send. */
export interface MessageDraft {
  text: string;
  attachment: DraftAttachment | null;
}

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** The MIME type of a picked photo (from the picker, else from its file name). */
export function photoType(
  mimeType: string | null | undefined,
  fileName: string | null | undefined
) {
  if (mimeType) {
    return mimeType.toLowerCase();
  }
  const extension = (fileName ?? '').split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? 'image/jpeg';
}

/** Why a photo cannot be attached, or `null` when it can (web: `imageProblem`). */
export function imageProblem(photo: Pick<PickedPhoto, 'mimeType' | 'size'>): string | null {
  if (!IMAGE_TYPES.includes(photo.mimeType)) {
    return 'Use a JPEG, PNG or WebP photo.';
  }
  if (photo.size !== null && photo.size > IMAGE_MAX_BYTES) {
    return 'Choose a photo up to 8 MB.';
  }
  if (photo.size === 0) {
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
      return { kind: 'CARD_LINK', body, cardPrintingId: attachment.card.printingId };
    case 'binder':
      return { kind: 'BINDER_LINK', body, binderId: attachment.binder.binderId };
    case 'image':
      return { kind: 'IMAGE', body, imageUploadId };
    default:
      return { kind: 'TEXT', body: text };
  }
}

/** "1.2 MB" / "312 KB". */
export function fileSizeLabel(bytes: number | null): string {
  if (bytes === null) {
    return '';
  }
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Wording of send failures shown under the composer (web: `sendErrorMessage`). */
export function sendErrorMessage(error: ApiError): string {
  switch (error.errorCode) {
    case 'PAYLOAD_TOO_LARGE':
      return 'This photo is larger than 8 MB. Choose a smaller one.';
    case 'UNSUPPORTED_MEDIA_TYPE':
      return 'Use a JPEG, PNG or WebP photo.';
    case 'RATE_LIMITED': {
      const seconds = error.problem?.retryAfterSeconds;
      return seconds
        ? `You are sending messages too quickly. Try again in ${seconds} seconds.`
        : 'You are sending messages too quickly. Wait a moment and try again.';
    }
    case 'MESSAGING_BLOCKED':
      return 'You cannot message this collector. They may have blocked messages or you blocked them.';
    case 'MESSAGE_BLOCKED':
      return 'This message breaks the community guidelines, so it was not sent. Please rephrase it.';
    case 'LIMIT_REACHED':
      return 'You reached the photo limit of your plan for now. Try again later.';
    case 'VALIDATION_FAILED':
      return error.message || 'This message cannot be sent.';
    default:
      return friendlyMessage(error);
  }
}
