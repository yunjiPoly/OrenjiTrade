import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CollectorProfileResponse } from '@orenji/api-client';
import {
  CollectorProfileViewComponent,
  lookingForOf,
  ownLookingFor,
  placeLine,
} from './collector-profile-view.component';

const PROFILE = {
  id: 'u5',
  handle: 'maya_k',
  displayName: 'Maya Kashani',
  avatarUrl: null,
  bio: 'Mostly meta staples.',
  games: ['yugioh', 'pokemon'],
  tags: [{ slug: 'trader', label: 'Trader' }],
  location: {
    regionCode: 'americas-north',
    countryCode: 'CA',
    countryName: 'Canada',
    subdivisionCode: 'CA-QC',
    subdivisionName: 'Quebec',
    label: 'Quebec, Canada',
    city: 'Laval',
  },
  memberSince: '2024-03-01T00:00:00Z',
  lastActiveBucket: 'THIS_WEEK',
  onlineStatus: 'ONLINE',
  rating: { average: 4.9, count: 14 },
  publicBinderCount: 2,
  canMessage: true,
  isBlocked: false,
} as unknown as CollectorProfileResponse;

describe('CollectorProfileViewComponent (spec 11, boards W23 and W23b)', () => {
  let fixture: ComponentFixture<CollectorProfileViewComponent>;
  let element: HTMLElement;

  function render(own: boolean, extra: Partial<CollectorProfileResponse> = {}): void {
    TestBed.configureTestingModule({
      imports: [CollectorProfileViewComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(CollectorProfileViewComponent);
    fixture.componentRef.setInput('profile', { ...PROFILE, ...extra });
    fixture.componentRef.setInput('isOwn', own);
    fixture.componentRef.setInput('binders', []);
    fixture.componentRef.setInput('publicItems', []);
    fixture.componentRef.setInput(
      'lookingFor',
      own
        ? ownLookingFor([
            {
              id: 'w1',
              game: 'yugioh',
              card: { id: 'c1', name: 'Maxx "C"' },
              note: '',
              nearMintOnly: false,
              priceTerm: { label: '85% TCG' },
            } as never,
          ])
        : lookingForOf([
            {
              card: { id: 'c2', name: 'Fiendsmith Engraver' },
              printing: { id: 'p2', printingCode: 'LEDE-EN010' },
              note: 'Fictional note',
              nearMintOnly: true,
            } as never,
          ]),
    );
    fixture.componentRef.setInput('references', []);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  it('puts the city only in the header, beside the province, while it is shown', () => {
    expect(placeLine(PROFILE)).toBe('Laval, Quebec');
    expect(placeLine({ location: { ...PROFILE.location!, city: null } })).toBe('Quebec');
    expect(placeLine({ location: undefined })).toBeNull();
    render(false);
    expect(element.querySelector('[data-testid="collector-public-label"]')?.textContent).toBe(
      'Laval, Quebec',
    );
    expect(element.querySelector('[data-testid="collector-city"]')?.textContent).toBe('Laval');
    expect(element.querySelector('.cp__facts')?.textContent).toContain('Member since 2024');
    expect(element.querySelector('.cp__facts')?.textContent).toContain('Active this week');
    // No Location section and no map link (R6).
    expect(element.textContent).not.toMatch(/Binders in Quebec|\bkm\b/);
  });

  it("another collector's: Message {handle}, ⋯ for Share, Report and Block, I have it on wishes", () => {
    render(false);
    expect(element.querySelector('h1')?.textContent).toBe('Maya Kashani');
    expect(element.querySelector('.cp__handle')?.textContent).toContain('@maya_k');
    expect(element.querySelector('.cp__star')?.textContent).toContain('4.9');
    const message = element.querySelector('.cp__primary')!;
    expect(message.getAttribute('aria-label')).toBe('Message maya_k');
    expect(element.querySelector('[aria-label="More for maya_k"]')).not.toBeNull();
    const wishes = element.querySelector('[aria-label="Cards maya_k is looking for"]')!;
    expect(wishes.textContent).toContain('LEDE-EN010 · NM only');
    expect(wishes.textContent).toContain('Fictional note');
    const have = wishes.querySelector<HTMLButtonElement>('.cp__have')!;
    expect(have.getAttribute('aria-label')).toBe('I have Fiendsmith Engraver. Message maya_k');
    const asked: unknown[] = [];
    fixture.componentInstance.haveIt.subscribe((event) => asked.push(event.row.cardId));
    have.click();
    expect(asked).toEqual(['c2']);
    // No availability status on a profile (spec 11).
    expect(element.textContent).not.toMatch(/Available|None yet/);
  });

  it('your own: Edit profile, Share profile, the gear; Add cards; Edit on your wishes', () => {
    render(true);
    expect(element.querySelector('a[href="/settings/profile"]')?.textContent).toContain(
      'Edit profile',
    );
    expect(element.querySelector('a[href="/settings"]')?.getAttribute('aria-label')).toBe('Settings');
    expect(element.querySelector('a[href="/inventory?add=new"]')?.textContent).toContain(
      'Add cards',
    );
    const wishes = element.querySelector('[aria-label="Cards you are looking for"]')!;
    const edit = wishes.querySelector('a')!;
    expect(wishes.querySelector('a[aria-label="Edit Maxx \\"C\\""]')?.getAttribute('href')).toBe(
      '/search?tab=wishlist&wish=w1',
    );
    expect(edit).not.toBeNull();
    expect(element.querySelector('.cp__have')).toBeNull();
    expect(element.textContent).toContain('Location settings');
  });

  it('a blocked collector reads as blocked, with Unblock', () => {
    render(false, { isBlocked: true, canMessage: false });
    expect(element.querySelector('.cp__blocked')?.textContent).toContain('You blocked maya_k.');
    expect(element.querySelector('.cp__primary')).toBeNull();
  });
});
