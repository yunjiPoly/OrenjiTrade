import {
  chipClass,
  contextPhrase,
  flagRoomLine,
  gameName,
  initialsOf,
  messageKindLabel,
  moderationStateLabel,
  regionName,
  roomNameOfSlug,
  shareWords,
  sharedDetailLine,
} from './console-labels';

describe('console labels', () => {
  it('names regions and games, never their codes', () => {
    expect(regionName('americas-north')).toBe('Americas (North)');
    expect(regionName('Montréal')).toBeNull();
    expect(regionName(null)).toBeNull();
    expect(gameName('yugioh')).toBe('Yu-Gi-Oh!');
    expect(gameName('mtg')).toBe('Magic: The Gathering');
    expect(gameName('unknown-game')).toBeNull();
  });

  it('reads initials, the context of a report and a chip tone', () => {
    expect(initialsOf('Quick Flip')).toBe('QF');
    expect(initialsOf('@quickflip.cards')).toBe('QC');
    expect(initialsOf('')).toBe('?');
    expect(contextPhrase('CONVERSATION')).toBe('from a conversation');
    expect(contextPhrase('POST')).toBe('from a community post');
    expect(chipClass('warning')).toBe('cp-chip cp-chip--warning');
    expect(chipClass('neutral')).toBe('cp-chip');
  });

  it('names rooms from their slugs and messages in words, hiding shared details', () => {
    expect(roomNameOfSlug('americas-north-yugioh')).toBe('Americas (North) · Yu-Gi-Oh!');
    expect(roomNameOfSlug('europe-mtg')).toBe('Europe · Magic: The Gathering');
    expect(roomNameOfSlug('montreal-yugioh')).toBe('An archived channel');
    expect(messageKindLabel('CARD_LINK')).toBe('Card shared');
    expect(messageKindLabel('WHATEVER')).toBe('Message');
    expect(moderationStateLabel('FLAGGED')).toBe('Flagged');
    expect(sharedDetailLine('SHIPPING_ADDRESS')).toBe(
      'Shipping address shared · hidden from staff',
    );
    expect(sharedDetailLine('ETRANSFER_EMAIL')).toBe('e-Transfer email shared · hidden from staff');
    expect(sharedDetailLine(null)).toBeNull();
  });
});

describe("a flag's room line (review fix 1)", () => {
  const content = (extra: Record<string, unknown>) =>
    ({
      community: {
        postId: 'p',
        roomSlug: 'americas-north-yugioh',
        roomName: 'Yu-Gi-Oh!',
        regionCode: 'americas-north',
        game: 'yugioh',
        text: 'x',
        removed: false,
        ...extra,
      },
    }) as Parameters<typeof flagRoomLine>[0];

  it('names a room by its region and game, never a code', () => {
    expect(flagRoomLine(content({}))).toBe('Americas (North) · Yu-Gi-Oh!');
    expect(flagRoomLine(content({ game: 'onepiece', roomName: 'One Piece' }))).toBe(
      'Americas (North) · One Piece',
    );
    expect(flagRoomLine(content({}))).not.toMatch(/americas-north|yugioh/);
  });

  it('reads an archived channel (one named after a city sends no slug or name) by its game', () => {
    expect(flagRoomLine(content({ roomSlug: null, roomName: null, regionCode: null }))).toBe(
      'An archived channel · Yu-Gi-Oh!',
    );
    expect(
      flagRoomLine(
        content({ roomSlug: 'general', roomName: 'General', regionCode: null, game: null }),
      ),
    ).toBe('An archived channel');
  });

  it('has no line for a private message or an account', () => {
    expect(flagRoomLine({ community: undefined })).toBeNull();
  });
});

describe('shareWords (boards A20 and A22, review fix 1)', () => {
  it('prints a share of the total, rounded, and <1% for a sliver', () => {
    expect(shareWords(870, 1904)).toBe('46%');
    expect(shareWords(9, 1904)).toBe('<1%');
    expect(shareWords(0, 1904)).toBe('0%');
    expect(shareWords(3, 0)).toBe('0%');
  });
});
