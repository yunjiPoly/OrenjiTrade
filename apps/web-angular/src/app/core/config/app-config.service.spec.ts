import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_APP_CONFIG } from './app-config.model';
import { APP_CONFIG_URL, AppConfigService } from './app-config.service';

describe('AppConfigService', () => {
  let service: AppConfigService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AppConfigService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('loads and normalises config.json', async () => {
    const pending = service.load();
    backend.expectOne(APP_CONFIG_URL).flush({
      apiBaseUrl: 'https://api.example.test/',
      firebase: { apiKey: 'k', authDomain: 'a', projectId: 'p', appId: 'id' },
      environment: 'staging',
      unknown: true,
    });
    await pending;

    expect(service.loaded()).toBe(true);
    expect(service.loadError()).toBeNull();
    expect(service.apiBaseUrl()).toBe('https://api.example.test');
    expect(service.environment()).toBe('staging');
    expect(service.firebase()).toEqual({ apiKey: 'k', authDomain: 'a', projectId: 'p', appId: 'id' });
    expect(service.wsBaseUrl()).toBe(DEFAULT_APP_CONFIG.wsBaseUrl);
  });

  it('keeps defaults and records the error when config.json is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pending = service.load();
    backend.expectOne(APP_CONFIG_URL).flush('not found', { status: 404, statusText: 'Not Found' });
    await pending;

    expect(service.loaded()).toBe(true);
    expect(service.loadError()).not.toBeNull();
    expect(service.config()).toEqual(DEFAULT_APP_CONFIG);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
