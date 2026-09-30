import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { ListingHealthService, ListingStatus } from '@orenji/api-client';
import { of } from 'rxjs';
import { ListingsPausedBannerComponent } from './listings-paused-banner.component';

const LIVE: ListingStatus = {
  paused: false,
  canResume: false,
  strikes: 0,
  maxStrikes: 3,
  unansweredConversations30d: 0,
};

describe('ListingsPausedBannerComponent', () => {
  let fixture: ComponentFixture<ListingsPausedBannerComponent>;
  let element: HTMLElement;
  let getMyListingStatus: ReturnType<typeof vi.fn>;
  let resumeMyListings: ReturnType<typeof vi.fn>;
  let confirmed: boolean;
  let resumed: number;

  async function create(status: ListingStatus): Promise<void> {
    getMyListingStatus = vi.fn(() => of(status));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ListingHealthService, useValue: { getMyListingStatus, resumeMyListings } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(confirmed) }) } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(ListingsPausedBannerComponent);
    resumed = 0;
    fixture.componentInstance.resumed.subscribe(() => resumed++);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  function resumeButton(): HTMLButtonElement | undefined {
    return [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Resume listings'),
    );
  }

  beforeEach(() => {
    confirmed = true;
    resumeMyListings = vi.fn(() => of(LIVE));
  });

  it('renders nothing while the listings are live and nothing waits', async () => {
    await create(LIVE);
    expect(element.textContent?.trim()).toBe('');
  });

  it('reminds about unanswered conversations before a pause', async () => {
    await create({ ...LIVE, strikes: 2, unansweredConversations30d: 2 });
    expect(element.textContent).toContain('2 conversations waiting for your answer.');
    expect(element.textContent).toContain('after 3 unanswered conversations');
  });

  it('resumes an unresponsiveness pause after a confirmation', async () => {
    await create({
      ...LIVE,
      paused: true,
      source: 'UNRESPONSIVE' as never,
      canResume: true,
      strikes: 3,
    });
    expect(element.textContent).toContain('Your public listings are paused');
    resumeButton()?.click();
    await fixture.whenStable();
    expect(resumeMyListings).toHaveBeenCalled();
    expect(resumed).toBe(1);
    expect(element.textContent).not.toContain('Your public listings are paused');
  });

  it('explains a moderation pause without a resume button', async () => {
    await create({ ...LIVE, paused: true, source: 'MODERATION' as never, canResume: false });
    expect(element.textContent).toContain('The moderation team is reviewing your account');
    expect(resumeButton()).toBeUndefined();
  });
});
