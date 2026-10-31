import { changedLine, editorName } from './editor-line';

describe('who changed a setting (spec 15.8)', () => {
  const at = '2026-10-14T15:00:00Z';

  it('names the editor, never the id', () => {
    const edited = { updatedAt: at, updatedBy: 'b2a5…', updatedByName: 'Alex Morin' };
    expect(changedLine(edited)).toBe('Last changed Oct 14 by Alex Morin');
    expect(changedLine(edited, 'Changed')).toBe('Changed Oct 14 by Alex Morin');
    expect(editorName({ updatedBy: 'x', updatedByHandle: 'alex_m' })).toBe('@alex_m');
  });

  it('reads a default nobody changed, and a gone account', () => {
    expect(changedLine({ updatedAt: at, updatedBy: null })).toBe(
      'The defaults; nobody changed them yet.',
    );
    expect(changedLine(null, 'Changed')).toBe('Never changed');
    expect(changedLine({ updatedAt: at, updatedBy: 'id-of-a-gone-account' })).toBe(
      'Last changed Oct 14 by a deleted account',
    );
    expect(changedLine({ updatedAt: at, updatedBy: 'x' })).not.toContain('id-of');
  });
});
