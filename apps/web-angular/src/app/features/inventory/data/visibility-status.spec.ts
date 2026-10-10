import type { BinderResponse, Freshness, PrivacySettings } from '@orenji/api-client';
import { binderVisibilityStatus, itemVisibilityStatus, ownerIsVisible } from './visibility-status';

const NOW = Date.parse('2026-09-29T12:00:00Z');
const fresh: Freshness = {
  state: 'ACTIVE' as Freshness['state'],
  confirmedAt: '2026-09-29T09:00:00Z',
  updatedAt: '2026-09-29T09:00:00Z',
  label: 'Updated 3 hours ago',
};

function privacy(overrides: Partial<PrivacySettings>): PrivacySettings {
  return {
    discoverable: false,
    showOnlineStatus: false,
    showLastActive: true,
    profileVisibility: 'MEMBERS' as PrivacySettings['profileVisibility'],
    messagingPermission: 'MEMBERS_WITH_PROFILE' as PrivacySettings['messagingPermission'],
    wishlistVisible: false,
    searchDiscoverable: true,
    ...overrides,
  };
}

function binder(overrides: Partial<BinderResponse>): BinderResponse {
  return {
    id: 'b1',
    name: 'Trade binder',
    description: '',
    kind: 'TRADE' as BinderResponse['kind'],
    visibility: 'PRIVATE' as BinderResponse['visibility'],
    sortOrder: 0,
    itemCount: 1,
    publicItemCount: 0,
    effectivePublic: false,
    games: [],
    freshness: fresh,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('visibility status', () => {
  it('knows when the owner can be seen at all', () => {
    expect(ownerIsVisible(null)).toBeNull();
    expect(ownerIsVisible(privacy({}))).toBe(false);
    expect(ownerIsVisible(privacy({ discoverable: true }))).toBe(true);
    expect(
      ownerIsVisible(
        privacy({ profileVisibility: 'PUBLIC' as PrivacySettings['profileVisibility'] }),
      ),
    ).toBe(true);
    expect(
      ownerIsVisible(
        privacy({
          discoverable: true,
          profileVisibility: 'PRIVATE' as PrivacySettings['profileVisibility'],
        }),
      ),
    ).toBe(false);
  });

  it('describes private and visible items', () => {
    const base = { freshness: fresh, publicUntil: null, effectivePublic: false };
    expect(itemVisibilityStatus({ ...base, visibility: 'PRIVATE' as never })).toMatchObject({
      pending: false,
      label: 'Private',
    });
    expect(
      itemVisibilityStatus({ ...base, visibility: 'PUBLIC' as never, effectivePublic: true }),
    ).toMatchObject({ pending: false, label: 'Public' });
    expect(
      itemVisibilityStatus(
        {
          ...base,
          visibility: 'TEMPORARILY_PUBLIC' as never,
          publicUntil: '2026-09-29T15:00:00Z',
          effectivePublic: true,
        },
        { now: NOW },
      ),
    ).toMatchObject({ pending: false, label: 'Public · ends in 3 hours' });
  });

  it('explains why a public item is not visible', () => {
    const item = { freshness: fresh, publicUntil: null, effectivePublic: false };
    const hidden = itemVisibilityStatus({
      ...item,
      visibility: 'PUBLIC' as never,
      freshness: { ...fresh, state: 'HIDDEN' as Freshness['state'] },
    });
    expect(hidden.pending).toBe(true);
    expect(hidden.note).toContain('confirm');

    const privateBinder = itemVisibilityStatus(
      { ...item, visibility: 'PUBLIC' as never },
      { binder: binder({}), ownerVisible: true },
    );
    expect(privateBinder.label).toBe('Public · not visible');
    expect(privateBinder.note).toContain('“Trade binder” is private');

    const ended = itemVisibilityStatus(
      { ...item, visibility: 'TEMPORARILY_PUBLIC' as never, publicUntil: '2026-09-29T11:00:00Z' },
      { now: NOW },
    );
    expect(ended.note).toContain('ended');

    const ownerHidden = itemVisibilityStatus(
      { ...item, visibility: 'PUBLIC' as never },
      { ownerVisible: false },
    );
    expect(ownerHidden.note).toContain('hidden from the map');
  });

  it('describes binders', () => {
    expect(binderVisibilityStatus(binder({}))).toMatchObject({ pending: false, label: 'Private' });
    expect(
      binderVisibilityStatus(
        binder({ visibility: 'PUBLIC' as BinderResponse['visibility'], effectivePublic: true }),
      ),
    ).toMatchObject({ pending: false, label: 'Public' });
    expect(
      binderVisibilityStatus(binder({ visibility: 'PUBLIC' as BinderResponse['visibility'] }), {
        ownerVisible: false,
      }),
    ).toMatchObject({ pending: true, label: 'Public · not visible' });
  });
});
