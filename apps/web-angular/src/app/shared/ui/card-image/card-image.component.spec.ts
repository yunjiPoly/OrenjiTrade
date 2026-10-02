import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppConfigService } from '../../../core/config/app-config.service';
import { CARD_IMAGE_DIMENSIONS, CardImageComponent } from './card-image.component';

const API_IMAGE =
  'http://localhost:8080/api/v1/public/card-images/0f2b7c1e-5d0a-4f39-9c1a-5f0b8f2a1d11';

describe('CardImageComponent', () => {
  let fixture: ComponentFixture<CardImageComponent>;
  let host: HTMLElement;

  async function render(inputs: Record<string, unknown>): Promise<void> {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
  }

  const img = () => host.querySelector<HTMLImageElement>('img');
  const skeleton = () => host.querySelector('[data-testid="card-image-skeleton"]');
  const fallback = () => host.querySelector<HTMLElement>('[data-testid="card-image-fallback"]');

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CardImageComponent],
      providers: [
        { provide: AppConfigService, useValue: { apiBaseUrl: () => 'http://localhost:8080' } },
      ],
    });
    fixture = TestBed.createComponent(CardImageComponent);
    host = fixture.nativeElement as HTMLElement;
  });

  it('renders the API picture lazily, decoded asynchronously, with the card name as alt text', async () => {
    await render({ src: API_IMAGE, alt: 'Azure-Eyes Sky Dragon', game: 'yugioh' });
    const image = img();
    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe(API_IMAGE);
    expect(image?.getAttribute('alt')).toBe('Azure-Eyes Sky Dragon');
    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(image?.getAttribute('decoding')).toBe('async');
    expect(image?.hasAttribute('fetchpriority')).toBe(false);
    // Explicit size (5:7 frame) so nothing shifts while it loads.
    expect(image?.getAttribute('width')).toBe(String(CARD_IMAGE_DIMENSIONS.fill.width));
    expect(image?.getAttribute('height')).toBe(String(CARD_IMAGE_DIMENSIONS.fill.height));
    expect(fallback()).toBeNull();
  });

  it('shows the shimmer skeleton until the picture has loaded', async () => {
    await render({ src: API_IMAGE, alt: 'Azure-Eyes Sky Dragon' });
    expect(skeleton()).not.toBeNull();
    expect(host.getAttribute('data-state')).toBe('loading');
    expect(img()?.classList).not.toContain('ci__img--loaded');

    img()?.dispatchEvent(new Event('load'));
    await fixture.whenStable();
    expect(skeleton()).toBeNull();
    expect(host.getAttribute('data-state')).toBe('loaded');
    expect(img()?.classList).toContain('ci__img--loaded');
  });

  it('falls back to the placeholder card art on a load error and keeps the alt text', async () => {
    await render({ src: API_IMAGE, alt: 'Azure-Eyes Sky Dragon', game: 'yugioh' });
    img()?.dispatchEvent(new Event('error'));
    await fixture.whenStable();

    expect(img()).toBeNull();
    expect(skeleton()).toBeNull();
    expect(host.getAttribute('data-state')).toBe('error');
    const art = fallback();
    expect(art?.getAttribute('role')).toBe('img');
    expect(art?.getAttribute('aria-label')).toBe('Azure-Eyes Sky Dragon');
    expect(art?.querySelector('app-card-art')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('retries with a new URL after an error', async () => {
    await render({ src: API_IMAGE, alt: 'Azure-Eyes Sky Dragon' });
    img()?.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(img()).toBeNull();

    await render({ src: `${API_IMAGE}?v=2` });
    expect(img()?.getAttribute('src')).toBe(`${API_IMAGE}?v=2`);
    expect(skeleton()).not.toBeNull();
  });

  it('shows the placeholder art without a URL', async () => {
    await render({ src: null, alt: 'Lantern Fox Spirit', game: 'pokemon' });
    expect(img()).toBeNull();
    expect(host.getAttribute('data-state')).toBe('placeholder');
    expect(fallback()?.getAttribute('aria-label')).toBe('Lantern Fox Spirit');

    await render({ src: '   ' });
    expect(img()).toBeNull();
  });

  it('is decorative with an empty alt', async () => {
    await render({ src: API_IMAGE, alt: '' });
    expect(img()?.getAttribute('alt')).toBe('');

    img()?.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(fallback()?.hasAttribute('role')).toBe(false);
    expect(fallback()?.hasAttribute('aria-label')).toBe(false);
  });

  it('applies the size variant and loads the hero eagerly', async () => {
    await render({ src: API_IMAGE, alt: 'Azure-Eyes Sky Dragon', size: 'xs', eager: true });
    expect(host.getAttribute('data-size')).toBe('xs');
    expect(img()?.getAttribute('width')).toBe('36');
    expect(img()?.getAttribute('height')).toBe('50');
    expect(img()?.getAttribute('loading')).toBe('eager');
    expect(img()?.getAttribute('fetchpriority')).toBe('high');
  });

  it('resolves API-relative paths (realtime payloads) against the API origin', async () => {
    await render({ src: '/api/v1/public/placeholder-images/yugioh/azure.svg', alt: 'Azure' });
    expect(img()?.getAttribute('src')).toBe(
      'http://localhost:8080/api/v1/public/placeholder-images/yugioh/azure.svg',
    );
  });
});
