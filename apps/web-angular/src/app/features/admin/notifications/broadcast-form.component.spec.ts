import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BroadcastFormComponent } from './broadcast-form.component';

/** Board A20's announcement form (web stage WH2 review fix 2): console fields and "Last sent". */
describe('BroadcastFormComponent (board A20)', () => {
  let fixture: ComponentFixture<BroadcastFormComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BroadcastFormComponent] }).compileComponents();
    fixture = TestBed.createComponent(BroadcastFormComponent);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  const facts = () => element.querySelector('.bc__facts')?.textContent?.replace(/\s+/g, ' ') ?? '';

  it('says when the last announcement went out and to whom', async () => {
    expect(facts()).toContain('Last sent Not known');
    fixture.componentRef.setInput('lastSent', null);
    await fixture.whenStable();
    expect(facts()).toContain('Last sent Never');
    fixture.componentRef.setInput('lastSent', { at: '2026-10-16T15:00:00Z', audience: 'ALL' });
    await fixture.whenStable();
    expect(facts()).toContain('Last sent Oct 16 · every collector');
    expect(facts()).toContain('Staff only');
  });

  it('labels its fields above them and shows an error only after a send was tried', async () => {
    const title = element.querySelector<HTMLInputElement>('#bc-title')!;
    expect(element.querySelector('label[for="bc-title"]')?.textContent?.trim()).toBe('Title');
    expect(title.getAttribute('aria-invalid')).toBe('false');
    expect(element.textContent).not.toContain('A title is required.');
    const emitted: unknown[] = [];
    fixture.componentInstance.send.subscribe((value) => emitted.push(value));
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    expect(emitted).toEqual([]);
    expect(element.textContent).toContain('A title is required.');
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(element.querySelector('#bc-title-help')?.textContent).toContain('A title is required.');
  });
});
