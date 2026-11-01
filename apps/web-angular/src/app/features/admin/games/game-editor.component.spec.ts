import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameResponse } from '@orenji/api-client';
import { GameEditorComponent } from './game-editor.component';

describe('GameEditorComponent: New game (board A13)', () => {
  let fixture: ComponentFixture<GameEditorComponent>;
  let ref: ComponentRef<GameEditorComponent>;
  let element: HTMLElement;
  const blank = {
    slug: '',
    name: '',
    shortName: '',
    publisher: '',
    status: 'HIDDEN',
    sortOrder: 50,
    schema: {
      conditions: ['MINT'],
      editions: ['UNLIMITED'],
      languages: ['en'],
      finishes: ['NORMAL'],
      rarities: ['Common'],
      metadataFields: [],
      summaryFields: [],
    },
  } as unknown as GameResponse;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [GameEditorComponent] }).compileComponents();
    fixture = TestBed.createComponent(GameEditorComponent);
    ref = fixture.componentRef;
    ref.setInput('game', blank);
    ref.setInput('creating', true);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  const field = (label: string) =>
    Array.from(element.querySelectorAll<HTMLInputElement>('input')).find(
      (input) => input.getAttribute('formcontrolname') === label,
    )!;

  it('asks for a slug with the other fields, then emits the new game with it', async () => {
    const emitted: unknown[] = [];
    fixture.componentInstance.save.subscribe((value) => emitted.push(value));
    const create = Array.from(element.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create game'),
    )!;
    create.click();
    await fixture.whenStable();
    expect(emitted).toEqual([]);
    expect(element.textContent).toContain('A slug is required.');
    expect(element.textContent).toContain('A name is required.');

    for (const [name, value] of [
      ['slug', 'lorcana'],
      ['name', 'Lorcana'],
      ['shortName', 'Lorcana'],
      ['publisher', 'Fictional Games'],
    ]) {
      field(name).value = value;
      field(name).dispatchEvent(new Event('input'));
    }
    await fixture.whenStable();
    create.click();
    await fixture.whenStable();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ slug: 'lorcana', name: 'Lorcana', status: 'HIDDEN' });
  });

  it('refuses a slug that breaks the API rule', async () => {
    field('slug').value = 'Lor Cana';
    field('slug').dispatchEvent(new Event('input'));
    field('slug').dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(element.textContent).toContain(
      'Use 2 to 32 lower-case letters and digits separated by dashes.',
    );
  });
});
