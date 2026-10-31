import { channelIcon } from './community-helpers';

describe('channelIcon', () => {
  it('names a symbol for each channel kind, a forum for an unknown one', () => {
    expect(channelIcon('REGION')).toBe('public');
    expect(channelIcon('LOOKING_FOR')).toBe('travel_explore');
    expect(channelIcon('SOMETHING')).toBe('forum');
  });
});
