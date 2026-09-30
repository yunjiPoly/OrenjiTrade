import { SendMessageRequestKindEnum as Kind } from '@orenji/api-client';
import { IMAGE_MAX_BYTES, draftProblem, imageProblem, sendRequest } from './message-draft';
import { MESSAGE_MAX_LENGTH } from './message-text';

const card = {
  printingId: 'printing-1',
  cardId: 'card-1',
  name: 'Azure-Eyes Sky Dragon',
  printingCode: 'AZR-EN001',
  imageUrl: null,
  game: 'yugioh',
};

describe('message drafts', () => {
  it('accepts JPEG, PNG and WebP photos up to 8 MB', () => {
    expect(imageProblem({ type: 'image/png', size: 1024 })).toBeNull();
    expect(imageProblem({ type: 'image/webp', size: IMAGE_MAX_BYTES })).toBeNull();
    expect(imageProblem({ type: 'image/gif', size: 1024 })).toBe('Use a JPEG, PNG or WebP photo.');
    expect(imageProblem({ type: 'text/plain', size: 10 })).toBe('Use a JPEG, PNG or WebP photo.');
    expect(imageProblem({ type: 'image/jpeg', size: IMAGE_MAX_BYTES + 1 })).toBe(
      'Choose a photo up to 8 MB.',
    );
    expect(imageProblem({ type: 'image/jpeg', size: 0 })).toBe('This file is empty.');
  });

  it('needs text or an attachment, within the length limit', () => {
    expect(draftProblem({ text: '   ', attachment: null })).toBe(
      'Write a message or attach something.',
    );
    expect(draftProblem({ text: '', attachment: { kind: 'card', card } })).toBeNull();
    expect(draftProblem({ text: 'x'.repeat(MESSAGE_MAX_LENGTH + 1), attachment: null })).toContain(
      `${MESSAGE_MAX_LENGTH} characters`,
    );
    expect(draftProblem({ text: 'Hi', attachment: null })).toBeNull();
  });

  it('builds the request of each kind', () => {
    expect(sendRequest({ text: '  Hello ', attachment: null })).toEqual({
      kind: Kind.Text,
      body: 'Hello',
    });
    expect(sendRequest({ text: 'for trade?', attachment: { kind: 'card', card } })).toEqual({
      kind: Kind.CardLink,
      body: 'for trade?',
      cardPrintingId: 'printing-1',
    });
    expect(
      sendRequest({
        text: '',
        attachment: { kind: 'binder', binder: { binderId: 'b1', name: 'Trades', itemCount: 3 } },
      }),
    ).toEqual({ kind: Kind.BinderLink, body: undefined, binderId: 'b1' });
    expect(
      sendRequest({
        text: 'Here is my offer.',
        attachment: {
          kind: 'offer',
          offer: {
            offerId: 'o-1',
            cardName: 'Lantern Fox Spirit',
            terms: '$38.00',
            status: 'OPEN',
          },
        },
      }),
    ).toEqual({ kind: Kind.OfferLink, body: 'Here is my offer.', offerId: 'o-1' });
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    expect(
      sendRequest(
        { text: 'the page', attachment: { kind: 'image', file, previewUrl: 'blob:x' } },
        'upload-1',
      ),
    ).toEqual({ kind: Kind.Image, body: 'the page', imageUploadId: 'upload-1' });
  });
});
