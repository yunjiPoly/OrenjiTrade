import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiError } from '../../../core/http/api-error';
import type { PreviewState } from '../data/map-discovery.store';
import { collector, preview } from '../data/testing/collector-fixtures';
import { CollectorPreviewCardComponent } from './collector-preview-card.component';

describe('CollectorPreviewCardComponent', () => {
  let fixture: ComponentFixture<CollectorPreviewCardComponent>;
  let element: HTMLElement;

  async function render(state: PreviewState, inputs: Record<string, unknown> = {}): Promise<void> {
    fixture.componentRef.setInput('state', state);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  function button(name: string): HTMLElement | undefined {
    return [...element.querySelectorAll<HTMLElement>('a, button')].find((node) =>
      node.textContent?.includes(name),
    );
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(CollectorPreviewCardComponent);
  });

  it('shows the approximate details and the actions of a collector', async () => {
    await render(
      {
        kind: 'ready',
        handle: 'maika',
        preview: preview('maika', {
          displayName: 'Maïka Tremblay',
          rating: { average: 4.8, count: 12 },
          tags: ['local-meetups'],
          games: ['yugioh'],
          publicBinderCount: 2,
          publicItemCount: 143,
        }),
      },
      { signedIn: true, binderId: 'b1' },
    );
    const dialog = element.querySelector('[role=dialog]')!;
    expect(dialog.getAttribute('aria-labelledby')).toBe(element.querySelector('h2')?.id);
    expect(element.querySelector('h2')?.textContent).toContain('Maïka Tremblay');
    expect(element.textContent).toContain('Plateau-Mont-Royal, Montréal');
    expect(element.querySelector('[data-testid=preview-distance]')?.textContent).toContain(
      '1–5 km away',
    );
    expect(element.textContent).toContain('4.8 (12 ratings)');
    expect(element.textContent).toContain('Active today');
    expect(element.textContent).toContain('2 public binders · 143 cards');
    expect(element.textContent).toContain('Local meetups');
    expect(element.textContent).toContain('Yu-Gi-Oh!');
    expect(button('View profile')?.getAttribute('href')).toBe('/collectors/maika');
    expect(button('View public binder')?.getAttribute('href')).toBe('/binders/b1');
    // Disabled but still focusable (disabledInteractive) so its tooltip is reachable.
    expect(button('Message')?.getAttribute('aria-disabled')).toBe('true');
    // Never a coordinate on screen.
    expect(element.textContent).not.toMatch(/45\.52|73\.58/);
  });

  it('asks signed-out visitors to sign in for distances and disables a missing binder', async () => {
    await render(
      { kind: 'ready', handle: 'maika', preview: preview('maika', { distanceBucket: null }) },
      { signedIn: false, binderId: null },
    );
    expect(element.querySelector('[data-testid=preview-distance]')?.textContent).toContain(
      'Sign in to see distances',
    );
    expect(button('View public binder')?.getAttribute('aria-disabled')).toBe('true');
    expect(button('View public binder')?.getAttribute('href')).toBeNull();
  });

  it('opens a conversation when the collector accepts messages', async () => {
    const collectorPreview = preview('maika', { canMessage: true });
    await render({ kind: 'ready', handle: 'maika', preview: collectorPreview }, { signedIn: true });
    const messaged: unknown[] = [];
    fixture.componentInstance.messageRequested.subscribe((value) => messaged.push(value));
    const messageButton = button('Message') as HTMLButtonElement;
    expect(messageButton.disabled).toBe(false);
    expect(messageButton.getAttribute('aria-label')).toBe(
      `Message ${collectorPreview.displayName}`,
    );
    messageButton.click();
    expect(messaged).toEqual([collectorPreview]);

    await render(
      { kind: 'ready', handle: 'maika', preview: collectorPreview },
      { messaging: true },
    );
    expect(button('Opening…')?.hasAttribute('disabled')).toBe(true);
  });

  it('invites signed-out visitors to sign in before messaging', async () => {
    await render(
      { kind: 'ready', handle: 'maika', preview: preview('maika') },
      { signedIn: false },
    );
    expect(button('Sign in to message')?.getAttribute('href')).toBe(
      '/auth/sign-in?returnUrl=%2Fmap',
    );
  });

  it('hides the Message button on the viewer own preview', async () => {
    await render({ kind: 'ready', handle: 'me', preview: preview('me') }, { isSelf: true });
    expect(button('Message')).toBeUndefined();
  });

  it('shows loading, not-found and error states', async () => {
    await render({ kind: 'loading', handle: 'maika', marker: collector('maika') });
    expect(element.querySelector('[role=dialog]')?.getAttribute('aria-busy')).toBe('true');
    expect(element.querySelector('h2')?.textContent).toContain('Collector maika');

    await render({ kind: 'not-found', handle: 'maika' });
    expect(element.textContent).toContain('no longer on the map');

    const retried: unknown[] = [];
    fixture.componentInstance.retry.subscribe((value) => retried.push(value));
    await render({
      kind: 'error',
      handle: 'maika',
      error: new ApiError({
        errorCode: 'INTERNAL_ERROR',
        message: 'boom',
        requestId: 'req-1',
        status: 500,
        fieldErrors: {},
      }),
    });
    expect(element.textContent).toContain('The preview could not load');
    button('Retry')?.click();
    expect(retried).toHaveLength(1);
  });

  it('closes with Escape and the close button', async () => {
    await render({ kind: 'ready', handle: 'maika', preview: preview('maika') });
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    element
      .querySelector('[role=dialog]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    element.querySelector<HTMLButtonElement>('button[aria-label="Close preview"]')!.click();
    expect(closed).toBe(2);
  });
});
