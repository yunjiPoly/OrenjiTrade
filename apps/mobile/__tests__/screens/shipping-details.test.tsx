import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import ShippingDetailsScreen from '@/app/settings/shipping';
import { cleanDetail, savedDetailKey } from '@/src/features/shipping/savedDetails';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { mockApi } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

const store = () => (require('expo-secure-store') as { mockStore: Map<string, string> }).mockStore;

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

describe('saved shipping details (stage R4, spec section 13)', () => {
  it('keys them per account in the phone’s secure storage', () => {
    expect(savedDetailKey('address', 'uid-maika')).toBe('orenji.shipping.address.uid-maika');
    // Secure store keys allow letters, digits, ".", "-" and "_" only.
    expect(savedDetailKey('etransfer', 'a:b/c@d')).toBe('orenji.shipping.etransfer.a_b_c_d');
  });

  it('trims each line of an address and the email', () => {
    expect(cleanDetail('address', '\n  Sam Tremblay \n 123 Rue Exemple\n\n')).toBe(
      'Sam Tremblay\n123 Rue Exemple'
    );
    expect(cleanDetail('etransfer', '  sam@example.com ')).toBe('sam@example.com');
    expect(cleanDetail('address', '   ')).toBeNull();
  });
});

describe('Settings › Shipping details', () => {
  it('saves both on this phone only, sends nothing to the API, and deletes them', async () => {
    store().set(savedDetailKey('etransfer', 'uid-maika'), 'old@example.com');
    const api = mockApi(signedInRoutes());
    renderWithProviders(<ShippingDetailsScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByTestId('shipping-intro')).toHaveTextContent(
      /stay on this phone only.*nothing is sent until you tap send/
    );
    expect(screen.getByTestId('shipping-etransfer').props.value).toBe('old@example.com');
    expect(screen.getByTestId('shipping-save')).toBeDisabled();
    expect(
      screen.getByText('Deleting your account also wipes them from this phone.')
    ).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('shipping-address'), 'Sam Tremblay\n123 Rue Exemple');
    fireEvent.changeText(screen.getByTestId('shipping-etransfer'), ' sam@example.com ');
    fireEvent.press(screen.getByTestId('shipping-save'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(/Saved on this phone\.$/);
    // Saved: the bottom button says so again (mockup v50 screen 50).
    expect(screen.getByTestId('shipping-save')).toHaveTextContent('No changes yet');
    expect(store().get(savedDetailKey('address', 'uid-maika'))).toBe(
      'Sam Tremblay\n123 Rue Exemple'
    );
    expect(store().get(savedDetailKey('etransfer', 'uid-maika'))).toBe('sam@example.com');
    // Never on the server.
    for (const call of api.calls) {
      expect(JSON.stringify(call.body ?? null)).not.toMatch(/Exemple|sam@example/);
    }
    fireEvent.press(await screen.findByTestId('shipping-address-clear'));
    await waitFor(() => expect(store().has(savedDetailKey('address', 'uid-maika'))).toBe(false));
    await waitFor(() => expect(screen.getByTestId('shipping-address').props.value).toBe(''));
  });

  it('keeps them in the browser’s storage on Expo web (the test suite)', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' });
    const local = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => local.get(key) ?? null,
        setItem: (key: string, value: string) => local.set(key, value),
        removeItem: (key: string) => local.delete(key),
      },
    });
    try {
      mockApi(signedInRoutes());
      renderWithProviders(<ShippingDetailsScreen />, { port: new FakeAuthPort(testUser()) });
      fireEvent.changeText(await screen.findByTestId('shipping-etransfer'), 'sam@example.com');
      fireEvent.press(screen.getByTestId('shipping-save'));
      await waitFor(() =>
        expect(local.get(savedDetailKey('etransfer', 'uid-maika'))).toBe('sam@example.com')
      );
      expect(store().size).toBe(0);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
      // @ts-expect-error -- the test's own localStorage goes again.
      delete globalThis.localStorage;
    }
  });
});
