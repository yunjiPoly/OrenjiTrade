import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  booleanAttribute,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { GameResponse } from '@orenji/api-client';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../../shared/ui/segmented/segmented.component';
import { ImportSourceChoice, sourceOfFile } from './import-handoff.service';
import { IMPORT_SOURCES } from './import-labels';

const SOURCES: readonly SegmentOption<ImportSourceChoice>[] = [
  { value: 'YDK', label: IMPORT_SOURCES.YDK.toggle },
  { value: 'COLLECTR_CSV', label: IMPORT_SOURCES.COLLECTR_CSV.toggle },
];

/**
 * Import's source column (spec 9.11, 360): [Yu-Gi-Oh! deck (.ydk) | Collectr (.csv)], the dashed
 * drop zone with "Choose a file", the limits read from the server, "Paste the text of the file
 * instead" and "The preview is kept for 60 minutes."
 */
@Component({
  selector: 'app-import-source',
  imports: [MatButtonModule, MatIconModule, SegmentedComponent],
  templateUrl: './import-source.component.html',
  styleUrl: './import-source.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportSourceComponent {
  readonly choice = input.required<ImportSourceChoice>();
  readonly csvGame = input('');
  readonly games = input<readonly GameResponse[]>([]);
  readonly fileName = input<string | null>(null);
  readonly fileMeta = input('');
  readonly limitsText = input<string | null>(null);
  readonly limitsError = input(false, { transform: booleanAttribute });
  readonly keptText = input('');
  readonly busy = input(false, { transform: booleanAttribute });
  readonly chooseSource = output<ImportSourceChoice>();
  readonly csvGameChange = output<string>();
  readonly file = output<File>();
  readonly pasteText = output<string>();
  readonly retryLimits = output<void>();

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  protected readonly sources = SOURCES;
  protected readonly info = IMPORT_SOURCES;
  protected readonly over = signal(false);
  protected readonly pasteOpen = signal(false);
  protected readonly pasted = signal('');

  protected pickFile(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      this.file.emit(file);
    }
  }

  protected onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      this.over.set(true);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.over.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      const source = sourceOfFile(file.name);
      if (source && source !== this.choice()) {
        this.chooseSource.emit(source);
      }
      this.file.emit(file);
    }
  }
}
