import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InventoryService } from '@orenji/api-client';
import { of } from 'rxjs';
import { SessionService, SessionStatus } from '../../auth/session.service';
import { GameContext } from '../../game/game-context.service';
import { ShellLayout } from '../shell-layout.service';
import { GamePillComponent } from './game-pill.component';

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

describe('the game pill and "Choose a game" (spec 4.5, web WA)', () => {
  const status = signal<SessionStatus>('anonymous');
  let fixture: ComponentFixture<GamePillComponent>;
  let element: HTMLElement;
  let summary: ReturnType<typeof vi.fn>;

  afterEach(() =>
    document.querySelectorAll('.cdk-overlay-container').forEach((node) => (node.innerHTML = '')),
  );

  beforeEach(async () => {
    status.set('anonymous');
    summary = vi.fn(() => of({ byGame: { yugioh: 17, pokemon: 3 } }));
    await TestBed.configureTestingModule({
      imports: [GamePillComponent],
      providers: [
        { provide: SessionService, useValue: { status } },
        { provide: InventoryService, useValue: { getInventorySummary: summary } },
        { provide: ShellLayout, useValue: { narrow: signal(false) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(GamePillComponent);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  const pill = () => element.querySelector<HTMLButtonElement>('[data-testid="game-pill"]')!;
  async function open(): Promise<HTMLButtonElement[]> {
    pill().click();
    // The popover is a lazy chunk: wait until it is on screen.
    for (let i = 0; i < 50 && !document.querySelector('.app-popover [role="radio"]'); i++) {
      await settle(fixture);
    }
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.app-popover [role="radio"]'));
  }

  it('shows Yu-Gi-Oh! with its monogram from the tokens', () => {
    expect(pill().getAttribute('aria-label')).toBe('Game: Yu-Gi-Oh!. Change game');
    const tile = pill().querySelector<HTMLElement>('.pill__tile')!;
    expect(tile.textContent?.trim()).toBe('Y');
    expect(tile.getAttribute('style')).toContain('--game-tile-yugioh-background');
  });

  it('lists every game; until web WD only Yu-Gi-Oh! can be picked, the rest "Cards coming soon"', async () => {
    const rows = await open();
    expect(rows.map((row) => row.querySelector('.pop__name')?.textContent)).toEqual([
      'Yu-Gi-Oh!',
      'Pokémon',
      'Magic',
      'One Piece',
      'Riftbound',
    ]);
    expect(rows.map((row) => row.getAttribute('aria-disabled'))).toEqual([
      null,
      'true',
      'true',
      'true',
      'true',
    ]);
    expect(rows.slice(1).every((row) => row.textContent?.includes('Cards coming soon'))).toBe(true);
    // A guest has no cards of their own: no count, and no call for one.
    expect(rows[0].querySelector('.pop__line')).toBeNull();
    expect(summary).not.toHaveBeenCalled();
    rows[1].click();
    await settle(fixture);
    expect(TestBed.inject(GameContext).current()).toBe('yugioh');
    expect(document.querySelector('.app-popover')).not.toBeNull();
  });

  it('tells a signed-in collector how many of their cards each game has', async () => {
    status.set('ready');
    const rows = await open();
    expect(summary).toHaveBeenCalledTimes(1);
    expect(rows[0].querySelector('.pop__line')?.textContent).toBe('17 of your cards');
    rows[0].click();
    await settle(fixture);
    expect(document.querySelector('.app-popover')).toBeNull();
    expect(document.activeElement).toBe(pill());
  });
});
