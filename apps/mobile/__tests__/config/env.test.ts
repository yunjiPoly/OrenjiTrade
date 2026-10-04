import { LOCAL_FIREBASE, devHostFor, resolveConfig } from '@/src/config/env';

describe('resolveConfig', () => {
  it('targets the local stack by default: 10.0.2.2 on the Android emulator, localhost elsewhere', () => {
    expect(devHostFor('android')).toBe('10.0.2.2');
    expect(devHostFor('ios')).toBe('localhost');
    expect(devHostFor('web')).toBe('localhost');

    const android = resolveConfig({}, 'android');
    expect(android.apiBaseUrl).toBe('http://10.0.2.2:8080');
    expect(android.authEmulatorHost).toBe('10.0.2.2:9099');
    expect(android.firebase).toEqual(LOCAL_FIREBASE);

    const web = resolveConfig({}, 'web');
    expect(web.apiBaseUrl).toBe('http://localhost:8080');
    expect(web.authEmulatorHost).toBe('localhost:9099');
  });

  it('uses explicit public values, trimmed and without trailing slashes', () => {
    const config = resolveConfig(
      {
        apiBaseUrl: ' http://10.0.2.2:8090/ ',
        authEmulatorHost: 'http://10.0.2.2:9099/',
        firebaseApiKey: 'demo-local-key',
        firebaseProjectId: 'orenjitrade-local',
        firebaseAppId: '1:2:web:3',
      },
      'android'
    );
    expect(config.apiBaseUrl).toBe('http://10.0.2.2:8090');
    expect(config.authEmulatorHost).toBe('10.0.2.2:9099');
    expect(config.firebase).toEqual({
      apiKey: 'demo-local-key',
      authDomain: 'orenjitrade-local.firebaseapp.com',
      projectId: 'orenjitrade-local',
      appId: '1:2:web:3',
    });
  });

  it('talks to a real Firebase project only when the emulator is off or another project is set', () => {
    expect(resolveConfig({ authEmulatorHost: 'off' }, 'ios').authEmulatorHost).toBeNull();
    expect(resolveConfig({ authEmulatorHost: 'none' }, 'ios').authEmulatorHost).toBeNull();
    const real = resolveConfig(
      {
        firebaseProjectId: 'orenjitrade-prod',
        firebaseApiKey: 'public-key',
        apiBaseUrl: 'https://api.orenjitrade.com',
      },
      'ios'
    );
    expect(real.authEmulatorHost).toBeNull();
    expect(real.firebase.authDomain).toBe('orenjitrade-prod.firebaseapp.com');
  });

  it('treats blank values as unset', () => {
    const config = resolveConfig(
      { apiBaseUrl: '   ', firebaseApiKey: '', authEmulatorHost: ' ' },
      'ios'
    );
    expect(config.apiBaseUrl).toBe('http://localhost:8080');
    expect(config.firebase.apiKey).toBe(LOCAL_FIREBASE.apiKey);
    expect(config.authEmulatorHost).toBe('localhost:9099');
  });
});
