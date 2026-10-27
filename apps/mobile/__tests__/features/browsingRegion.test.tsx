import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { meKeys } from '@/src/api/queryKeys';
import { RegionBar } from '@/src/features/regions/RegionBar';
import { useAccount } from '@/src/account/AccountProvider';
import {
  BROWSING_REGION_STORAGE_KEY,
  GUEST_BROWSING_REGION_STORAGE_KEY,
  browsingScope,
  forgetUnknownRegions,
  hydrateBrowsingRegion,
  pickBrowsingRegion,
  resetBrowsingRegion,
  resolveBrowsingRegion,
  useBrowsingRegion,
  useBrowsingRegionStore,
} from '@/src/features/regions/browsingRegion';
import { BUILT_IN_REGIONS, isRegionCode, regionPhrase } from '@/src/lib/place';
import { lightPalette } from '@/src/theme/palette';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { meFixture, regionsFixture } from '../support/fixtures';
import { mockApi, ok } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { createTestQueryClient, renderWithProviders, resetAppState } from '../test-utils';

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

beforeEach(async () => {
  resetAppState();
  await AsyncStorage.clear();
});

/** The `select` of the last render of the probe (what a link calls). */
const selected: { current: (region: string) => void } = { current: () => undefined };

/** What a screen reads from the browsed region, as text. */
function Probe() {
  const { region, home, away, ready, select } = useBrowsingRegion();
  const account = useAccount();
  selected.current = select;
  return (
    <>
      <RegionBar testID="switcher" />
      <Text testID="probe">{`${region}|${home ?? 'none'}|${away ? 'away' : 'home'}|${ready ? 'ready' : 'waiting'}`}</Text>
      <Text testID="probe-account">{account.me ? 'account known' : 'account unknown'}</Text>
    </>
  );
}

const probe = () => screen.getByTestId('probe');
const signedIn = (uid = 'uid-maika') => new FakeAuthPort(testUser({ uid }));

function pick(region: string) {
  fireEvent.press(screen.getByTestId('switcher'));
  fireEvent.press(screen.getByTestId(`switcher-option-${region}`));
}

describe('which region the app browses (pure)', () => {
  const scope = browsingScope('uid-1', 'europe');

  it('prefers the pick of this session, then the home region, then the device, then Americas (North)', () => {
    const picked = { region: 'americas-south', scope };
    expect(resolveBrowsingRegion({ picked, scope, home: 'europe', stored: 'europe' })).toBe(
      'americas-south'
    );
    expect(
      resolveBrowsingRegion({ picked: null, scope, home: 'europe', stored: 'americas-south' })
    ).toBe('europe');
    expect(
      resolveBrowsingRegion({ picked: null, scope, home: null, stored: 'americas-south' })
    ).toBe('americas-south');
    expect(resolveBrowsingRegion({ picked: null, scope, home: null, stored: null })).toBe(
      'americas-north'
    );
  });

  it('drops a pick made under another account or another home region', () => {
    const picked = { region: 'americas-south', scope };
    const elsewhere = browsingScope('uid-1', 'americas-north');
    expect(
      resolveBrowsingRegion({ picked, scope: elsewhere, home: 'americas-north', stored: null })
    ).toBe('americas-north');
    const someoneElse = browsingScope('uid-2', 'europe');
    expect(
      resolveBrowsingRegion({ picked, scope: someoneElse, home: 'europe', stored: null })
    ).toBe('europe');
    expect(browsingScope(null, null)).toBe('|');
  });

  it('follows a pick or a stored code only when the region exists', () => {
    // Until the server's list is read, the three regions the app ships are the ones that exist.
    expect([...BUILT_IN_REGIONS]).toEqual(['americas-north', 'americas-south', 'europe']);
    expect(resolveBrowsingRegion({ picked: null, scope, home: null, stored: 'asia' })).toBe(
      'americas-north'
    );
    const picked = { region: 'asia', scope };
    expect(resolveBrowsingRegion({ picked, scope, home: 'europe', stored: 'asia' })).toBe('europe');
    expect(resolveBrowsingRegion({ picked, scope, home: null, stored: null })).toBe(
      'americas-north'
    );
    // The server's list is the judge once it is known: a region it added is followed ...
    const listed = new Set(['americas-north', 'europe', 'asia']);
    expect(
      resolveBrowsingRegion({ picked, scope, home: 'europe', stored: null, known: listed })
    ).toBe('asia');
    expect(
      resolveBrowsingRegion({ picked: null, scope, home: null, stored: 'asia', known: listed })
    ).toBe('asia');
    // ... and one it took down is not, even though the app ships its name.
    expect(
      resolveBrowsingRegion({
        picked: { region: 'americas-south', scope },
        scope,
        home: null,
        stored: 'americas-south',
        known: listed,
      })
    ).toBe('americas-north');
    // The home region comes from the server itself: it is always followed.
    expect(
      resolveBrowsingRegion({ picked: null, scope, home: 'oceania', stored: null, known: listed })
    ).toBe('oceania');
  });

  it('accepts well-formed region codes only (a well-formed code is not yet a region)', () => {
    expect(['americas-north', 'americas-south', 'europe', 'asia'].every(isRegionCode)).toBe(true);
    expect(BUILT_IN_REGIONS.has('asia')).toBe(false);
    for (const value of [
      null,
      undefined,
      '',
      'Europe',
      'europe ',
      'eu rope',
      '45.5,-73.6',
      'a'.repeat(33),
    ]) {
      expect(isRegionCode(value)).toBe(false);
    }
  });

  it('says "your region" at home and names another region', () => {
    expect(regionPhrase('europe', 'europe')).toBe('your region');
    expect(regionPhrase('americas-north', null)).toBe('your region');
    expect(regionPhrase('europe', 'americas-north')).toBe('Europe');
    expect(regionPhrase('americas-south', null)).toBe('Americas (South)');
  });
});

describe('the browsed region and its switcher', () => {
  it('starts in the home region of the signed-in collector, whatever the device kept', async () => {
    await AsyncStorage.setItem(BROWSING_REGION_STORAGE_KEY, 'americas-south');
    mockApi(signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ homeRegion: 'europe' })) }));
    renderWithProviders(<Probe />, { port: signedIn() });
    await waitFor(() => expect(probe()).toHaveTextContent('europe|europe|home|ready'));
    expect(screen.getByRole('button', { name: 'Region: Europe. Change region' })).toBeOnTheScreen();
    expect(screen.queryByTestId('switcher-away')).toBeNull();
  });

  it('falls back to the last region picked on this device, then to Americas (North)', async () => {
    await AsyncStorage.setItem(BROWSING_REGION_STORAGE_KEY, 'americas-south');
    mockApi(signedInRoutes());
    const first = renderWithProviders(<Probe />, { port: signedIn() });
    // Not settled before the device answered: nothing is asked in a region that may change.
    expect(probe()).toHaveTextContent(/\|waiting$/);
    await waitFor(() => expect(probe()).toHaveTextContent('americas-south|none|home|ready'));
    expect(
      screen.getByRole('button', { name: 'Region: Americas (South). Change region' })
    ).toBeOnTheScreen();
    first.unmount();

    resetAppState();
    await AsyncStorage.clear();
    renderWithProviders(<Probe />, { port: signedIn() });
    await waitFor(() => expect(probe()).toHaveTextContent('americas-north|none|home|ready'));
  });

  it('offers the three regions in a sheet, marks the home one and keeps the pick on the device', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })) }));
    renderWithProviders(<Probe />, { port: signedIn() });
    await waitFor(() =>
      expect(probe()).toHaveTextContent('americas-north|americas-north|home|ready')
    );

    // At home the switcher is a plain pill (stage G, mockup screen 35).
    expect(screen.getByTestId('switcher')).toHaveStyle({
      backgroundColor: lightPalette.surface,
      borderColor: lightPalette.borderStrong,
    });
    fireEvent.press(
      screen.getByRole('button', { name: 'Region: Americas (North). Change region' })
    );
    const options = screen.getAllByRole('radio');
    expect(options.map((option) => option.props.accessibilityLabel)).toEqual([
      'Americas (North)',
      'Americas (South)',
      'Europe',
    ]);
    expect(screen.getByRole('radio', { name: 'Americas (North)' })).toBeChecked();
    // On screen as a second line, and said after the name by a screen reader.
    expect(screen.getByTestId('switcher-option-americas-north')).toHaveTextContent(/Your region/);
    expect(screen.getByTestId('switcher-option-americas-north').props.accessibilityHint).toBe(
      'Your region · Canada, United States, Mexico'
    );
    expect(screen.getByTestId('switcher-option-europe')).not.toHaveTextContent(/Your region/);
    expect(screen.getByTestId('switcher-option-europe').props.accessibilityHint).toBe(
      'France, Germany, Spain and more'
    );
    expect(screen.getByText('Choose a region')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Home, Search and the map show one region at a time. Cards ship within a region.'
      )
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Your own region comes from Settings › Location. Browsing another one changes nothing on your profile.'
      )
    ).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('radio', { name: 'Europe' }));
    await waitFor(() => expect(probe()).toHaveTextContent('europe|americas-north|away|ready'));
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(BROWSING_REGION_STORAGE_KEY)).toBe('europe')
    );

    // Away from home: the switcher says so at a glance (its border turns orange, and a line says
    // it in words) and one press goes back.
    expect(screen.getByRole('button', { name: 'Region: Europe. Change region' })).toBeOnTheScreen();
    expect(screen.getByTestId('switcher')).toHaveStyle({
      backgroundColor: lightPalette.surface,
      borderColor: lightPalette.primary,
    });
    expect(screen.getByTestId('switcher-away')).toHaveTextContent(
      'Not your region.Back to Americas (North)'
    );
    fireEvent.press(screen.getByRole('button', { name: 'Back to Americas (North)' }));
    await waitFor(() =>
      expect(probe()).toHaveTextContent('americas-north|americas-north|home|ready')
    );
    expect(screen.queryByTestId('switcher-away')).toBeNull();
    expect(screen.getByTestId('switcher')).toHaveStyle({
      borderColor: lightPalette.borderStrong,
    });
  });

  it('uses the names of GET /regions once they were read, without asking for them itself', async () => {
    const regions = regionsFixture();
    const europe = regions.regions.find((region) => region.code === 'europe');
    if (europe) {
      europe.name = 'Europe and neighbours';
    }
    const api = mockApi(signedInRoutes({ 'GET /api/v1/regions': ok(regions) }));
    const queryClient = createTestQueryClient();
    renderWithProviders(<Probe />, { port: signedIn(), queryClient });
    await waitFor(() => expect(probe()).toHaveTextContent(/\|ready$/));
    expect(api.callsTo('GET /api/v1/regions')).toHaveLength(0);
    fireEvent.press(screen.getByTestId('switcher'));
    expect(screen.getByRole('radio', { name: 'Europe' })).toBeOnTheScreen();

    act(() => {
      queryClient.setQueryData(['public', 'regions'], regions);
    });
    expect(await screen.findByRole('radio', { name: 'Europe and neighbours' })).toBeOnTheScreen();
  });

  it('comes back to the home region when the collector moves to another region', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })) }));
    const queryClient = createTestQueryClient();
    renderWithProviders(<Probe />, { port: signedIn(), queryClient });
    await waitFor(() => expect(probe()).toHaveTextContent(/^americas-north\|.*ready$/));
    pick('americas-south');
    await waitFor(() =>
      expect(probe()).toHaveTextContent('americas-south|americas-north|away|ready')
    );

    // Settings → Location saved a place in Europe: `/me` now names another home region.
    act(() => {
      queryClient.setQueryData(meKeys.account('uid-maika'), meFixture({ homeRegion: 'europe' }));
    });
    await waitFor(() => expect(probe()).toHaveTextContent('europe|europe|home|ready'));
  });

  it('waits for the device before it settles the region of a collector without a location', async () => {
    // `/me` answered (no home region) and the device has not: nothing may be asked yet, or it
    // would be asked in Americas (North) first and again in the region the device kept.
    let answer: (value: string | null) => void = () => undefined;
    storage.getItem.mockImplementationOnce(
      () =>
        new Promise<string | null>((resolve) => {
          answer = resolve;
        })
    );
    mockApi(signedInRoutes());
    renderWithProviders(<Probe />, { port: signedIn() });
    await waitFor(() =>
      expect(screen.getByTestId('probe-account')).toHaveTextContent('account known')
    );
    expect(probe()).toHaveTextContent('americas-north|none|home|waiting');

    await act(async () => {
      answer('americas-south');
      await hydrateBrowsingRegion();
    });
    expect(probe()).toHaveTextContent('americas-south|none|home|ready');
  });

  it('does not wait for the device when the collector has a home region', async () => {
    storage.getItem.mockImplementationOnce(() => new Promise<string | null>(() => undefined));
    mockApi(signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ homeRegion: 'europe' })) }));
    renderWithProviders(<Probe />, { port: signedIn() });
    await waitFor(() => expect(probe()).toHaveTextContent('europe|europe|home|ready'));
  });

  it('never browses or keeps a region that does not exist', async () => {
    // A well-formed code the server does not list, as a link or an old install could bring.
    mockApi(signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })) }));
    renderWithProviders(<Probe />, { port: signedIn() });
    await waitFor(() =>
      expect(probe()).toHaveTextContent('americas-north|americas-north|home|ready')
    );
    storage.setItem.mockClear();
    act(() => selected.current('asia'));
    act(() => selected.current('Somewhere 45.5'));
    expect(probe()).toHaveTextContent('americas-north|americas-north|home|ready');
    expect(useBrowsingRegionStore.getState()).toMatchObject({ picked: null, stored: null });
    expect(storage.setItem).not.toHaveBeenCalled();
    // A region that exists is followed, and the home region always is.
    act(() => selected.current('europe'));
    await waitFor(() => expect(probe()).toHaveTextContent('europe|americas-north|away|ready'));
    act(() => selected.current('americas-north'));
    await waitFor(() =>
      expect(probe()).toHaveTextContent('americas-north|americas-north|home|ready')
    );
  });

  it('forgets a region the device kept once the server does not list it', async () => {
    await AsyncStorage.setItem(BROWSING_REGION_STORAGE_KEY, 'oceania');
    mockApi(signedInRoutes());
    const queryClient = createTestQueryClient();
    renderWithProviders(<Probe />, { port: signedIn(), queryClient });
    // Not one of the regions the app ships: not browsed, and the switcher names a real region.
    await waitFor(() => expect(probe()).toHaveTextContent('americas-north|none|home|ready'));
    expect(
      screen.getByRole('button', { name: 'Region: Americas (North). Change region' })
    ).toBeOnTheScreen();
    // The server has not spoken yet: the code is still on the device.
    expect(useBrowsingRegionStore.getState().stored).toBe('oceania');
    expect(await AsyncStorage.getItem(BROWSING_REGION_STORAGE_KEY)).toBe('oceania');

    act(() => {
      queryClient.setQueryData(['public', 'regions'], regionsFixture());
    });
    await waitFor(() => expect(useBrowsingRegionStore.getState().stored).toBeNull());
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(BROWSING_REGION_STORAGE_KEY)).toBeNull()
    );
    expect(probe()).toHaveTextContent('americas-north|none|home|ready');
  });

  it('follows a kept region the app does not ship once the server lists it', async () => {
    await AsyncStorage.setItem(BROWSING_REGION_STORAGE_KEY, 'oceania');
    mockApi(signedInRoutes());
    const queryClient = createTestQueryClient();
    renderWithProviders(<Probe />, { port: signedIn(), queryClient });
    await waitFor(() => expect(probe()).toHaveTextContent('americas-north|none|home|ready'));
    const regions = regionsFixture();
    regions.regions.push({ code: 'oceania', name: 'Oceania', isDefault: false, countries: [] });
    act(() => {
      queryClient.setQueryData(['public', 'regions'], regions);
    });
    await waitFor(() => expect(probe()).toHaveTextContent('oceania|none|home|ready'));
    expect(
      screen.getByRole('button', { name: 'Region: Oceania. Change region' })
    ).toBeOnTheScreen();
    expect(await AsyncStorage.getItem(BROWSING_REGION_STORAGE_KEY)).toBe('oceania');
  });

  it('does not carry a pick over to another account on the same device', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })) }));
    const first = renderWithProviders(<Probe />, { port: signedIn('uid-first') });
    await waitFor(() => expect(probe()).toHaveTextContent(/^americas-north\|.*ready$/));
    pick('europe');
    await waitFor(() => expect(probe()).toHaveTextContent(/^europe\|americas-north\|away/));
    first.unmount();

    renderWithProviders(<Probe />, { port: signedIn('uid-second') });
    await waitFor(() =>
      expect(probe()).toHaveTextContent('americas-north|americas-north|home|ready')
    );
    // The device still remembers the last pick, for an account without a home region.
    expect(useBrowsingRegionStore.getState().stored).toBe('europe');
  });
});

describe('a device storage that fails', () => {
  afterEach(() => {
    storage.getItem.mockClear();
    storage.setItem.mockClear();
  });

  it('browses Americas (North) when the last pick cannot be read', async () => {
    storage.getItem.mockRejectedValueOnce(new Error('storage is unavailable'));
    mockApi(signedInRoutes());
    renderWithProviders(<Probe />, { port: signedIn() });
    await waitFor(() => expect(probe()).toHaveTextContent('americas-north|none|home|ready'));
    expect(useBrowsingRegionStore.getState()).toMatchObject({ stored: null, hydrated: true });
  });

  it('ignores something else than a region code in the storage', async () => {
    await AsyncStorage.setItem(BROWSING_REGION_STORAGE_KEY, '{"lat":45.5}');
    await hydrateBrowsingRegion();
    expect(useBrowsingRegionStore.getState()).toMatchObject({ stored: null, hydrated: true });
  });

  it('keeps a pick for the session when it cannot be written', async () => {
    storage.setItem.mockRejectedValueOnce(new Error('the disk is full'));
    mockApi(signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })) }));
    renderWithProviders(<Probe />, { port: signedIn() });
    await waitFor(() => expect(probe()).toHaveTextContent(/^americas-north\|.*ready$/));
    pick('europe');
    await waitFor(() => expect(probe()).toHaveTextContent('europe|americas-north|away|ready'));
    expect(await AsyncStorage.getItem(BROWSING_REGION_STORAGE_KEY)).toBeNull();
    // The failure is swallowed where it happens: the promise of a pick never rejects.
    storage.setItem.mockRejectedValueOnce(new Error('still full'));
    await expect(
      pickBrowsingRegion('americas-south', browsingScope('uid-maika', 'americas-north'))
    ).resolves.toBeUndefined();
  });

  it('refuses to pick something that is not a region code', async () => {
    await pickBrowsingRegion('Somewhere 45.5', '|');
    expect(useBrowsingRegionStore.getState().picked).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalledWith(
      BROWSING_REGION_STORAGE_KEY,
      expect.anything()
    );
  });

  it('forgets an unknown region for the session even when it cannot be removed from the device', async () => {
    await pickBrowsingRegion('asia', '|');
    storage.removeItem.mockRejectedValueOnce(new Error('storage is unavailable'));
    await expect(
      forgetUnknownRegions(new Set(['americas-north', 'europe']))
    ).resolves.toBeUndefined();
    expect(useBrowsingRegionStore.getState()).toMatchObject({ picked: null, stored: null });
    // A region the list holds is left alone.
    await pickBrowsingRegion('europe', '|');
    await forgetUnknownRegions(new Set(['americas-north', 'europe']));
    expect(useBrowsingRegionStore.getState()).toMatchObject({
      picked: { region: 'europe', scope: '|' },
      stored: 'europe',
    });
  });

  it('a pick made while the device is being read is not overwritten by what it held', async () => {
    await AsyncStorage.setItem(BROWSING_REGION_STORAGE_KEY, 'americas-south');
    const reading = hydrateBrowsingRegion();
    await pickBrowsingRegion('europe', '|');
    await reading;
    expect(useBrowsingRegionStore.getState()).toMatchObject({ stored: 'europe', hydrated: true });
  });
});

describe("a guest's region (stage R15)", () => {
  const guest = () => new FakeAuthPort(null);

  it('starts on Americas (North), is ready without an account, and keeps a pick under the guest key', async () => {
    mockApi({ 'GET /api/v1/regions': ok(regionsFixture()) });
    renderWithProviders(<Probe />, { port: guest() });
    await waitFor(() => expect(probe()).toHaveTextContent('americas-north|none|home|ready'));
    pick('europe');
    await waitFor(() => expect(probe()).toHaveTextContent('europe|none|home|ready'));
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(GUEST_BROWSING_REGION_STORAGE_KEY)).toBe('europe')
    );
    // Never written where a collector's region is kept, and only the code.
    expect(await AsyncStorage.getItem(BROWSING_REGION_STORAGE_KEY)).toBeNull();
  });

  it('comes back for the next guest visit; a collector who signs in browses their own region', async () => {
    await AsyncStorage.setItem(GUEST_BROWSING_REGION_STORAGE_KEY, 'americas-south');
    mockApi({ 'GET /api/v1/regions': ok(regionsFixture()) });
    const first = renderWithProviders(<Probe />, { port: guest() });
    await waitFor(() => expect(probe()).toHaveTextContent('americas-south|none|home|ready'));
    first.unmount();

    // A new run of the app (the session's state goes, the phone's storage stays).
    resetBrowsingRegion();
    mockApi(signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ homeRegion: 'europe' })) }));
    renderWithProviders(<Probe />, { port: signedIn() });
    await waitFor(() => expect(probe()).toHaveTextContent('europe|europe|home|ready'));
    // The guest's region stays for the next guest visit, untouched.
    expect(await AsyncStorage.getItem(GUEST_BROWSING_REGION_STORAGE_KEY)).toBe('americas-south');
  });

  it('pickBrowsingRegion keeps the scopes apart', async () => {
    await pickBrowsingRegion('europe', 'guest');
    expect(useBrowsingRegionStore.getState()).toMatchObject({
      guestStored: 'europe',
      stored: null,
    });
    await pickBrowsingRegion('americas-south', browsingScope('uid-1', null));
    expect(useBrowsingRegionStore.getState()).toMatchObject({
      guestStored: 'europe',
      stored: 'americas-south',
    });
    await forgetUnknownRegions(new Set(['americas-south']));
    expect(useBrowsingRegionStore.getState().guestStored).toBeNull();
    expect(await AsyncStorage.getItem(GUEST_BROWSING_REGION_STORAGE_KEY)).toBeNull();
    await hydrateBrowsingRegion();
  });
});
