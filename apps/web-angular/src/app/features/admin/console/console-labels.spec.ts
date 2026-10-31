import {
  chipClass,
  contextPhrase,
  gameName,
  initialsOf,
  messageKindLabel,
  moderationStateLabel,
  regionName,
  roomNameOfSlug,
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
