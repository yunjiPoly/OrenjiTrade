import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { PageHeaderComponent } from './page-header.component';

describe('PageHeaderComponent', () => {
  const tabTitle = signal<string | null>(null);

  beforeEach(() => {
    tabTitle.set(null);
    TestBed.configureTestingModule({
      imports: [PageHeaderComponent],
      providers: [{ provide: ShellLayout, useValue: { tabTitle } }],
    });
  });

  async function render(inputs: Record<string, unknown>): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(PageHeaderComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('steps its title back while the per-tab bar below 960 shows it (spec 16), still the h1', async () => {
    tabTitle.set('Inventory');
    const element = await render({ title: 'Inventory', tabTitle: true });
    const h1 = element.querySelector('h1');
    expect(h1?.textContent).toBe('Inventory');
    expect(h1?.classList.contains('visually-hidden')).toBe(true);
  });

  it('keeps its title visible without a tab bar, or on a page that is not a tab’s own', async () => {
    let h1 = (await render({ title: 'Inventory', tabTitle: true })).querySelector('h1');
    expect(h1?.classList.contains('visually-hidden')).toBe(false);
    tabTitle.set('Profile');
    h1 = (await render({ title: 'Appearance' })).querySelector('h1');
    expect(h1?.classList.contains('visually-hidden')).toBe(false);
  });
});
