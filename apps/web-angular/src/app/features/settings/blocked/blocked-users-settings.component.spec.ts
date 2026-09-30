import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BlockedUser, BlocksService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { BlockActionsService } from '../../../shared/messaging/block-actions.service';
import { BlockedUsersSettingsComponent } from './blocked-users-settings.component';

const BLOCKED: BlockedUser[] = [
  { id: 'u1', handle: 'troll', displayName: 'Tess Troll', blockedAt: '2026-09-29T10:00:00Z' },
  { id: 'u2', handle: 'spam', displayName: 'Sam Spam', blockedAt: '2026-09-28T10:00:00Z' },
];

describe('BlockedUsersSettingsComponent', () => {
  let fixture: ComponentFixture<BlockedUsersSettingsComponent>;
  let element: HTMLElement;
  let listMyBlocks: ReturnType<typeof vi.fn>;
  let unblock: ReturnType<typeof vi.fn>;

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(BlockedUsersSettingsComponent);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  function button(name: string): HTMLButtonElement | undefined {
    return [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.getAttribute('aria-label') === name || !!node.textContent?.includes(name),
    );
  }

  beforeEach(() => {
    listMyBlocks = vi.fn(() => of(BLOCKED));
    unblock = vi.fn(async () => true);
    TestBed.configureTestingModule({
      providers: [
        { provide: BlocksService, useValue: { listMyBlocks } },
        { provide: BlockActionsService, useValue: { unblock } },
      ],
    });
  });

  it('lists blocked collectors and unblocks one', async () => {
    await create();
    expect(element.querySelectorAll('li')).toHaveLength(2);
    expect(element.textContent).toContain('Tess Troll');
    expect(element.textContent).toContain('@troll');
    button('Unblock Tess Troll')?.click();
    expect(unblock).toHaveBeenCalledWith({ id: 'u1', displayName: 'Tess Troll' });
    await fixture.whenStable();
    expect(element.querySelectorAll('li')).toHaveLength(1);
    expect(element.textContent).not.toContain('Tess Troll');
  });

  it('keeps the row when the unblock fails', async () => {
    unblock.mockResolvedValueOnce(false);
    await create();
    button('Unblock Sam Spam')?.click();
    await fixture.whenStable();
    expect(element.querySelectorAll('li')).toHaveLength(2);
  });

  it('shows an empty state and an error state with retry', async () => {
    listMyBlocks.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    await create();
    expect(element.textContent).toContain('Blocked users could not load');
    listMyBlocks.mockReturnValueOnce(of([]));
    button('Retry')?.click();
    await fixture.whenStable();
    expect(element.textContent).toContain('You have not blocked anyone');
  });
});
