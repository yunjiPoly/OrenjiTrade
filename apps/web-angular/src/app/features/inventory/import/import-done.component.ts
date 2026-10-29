import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { InventoryImportRow } from '@orenji/api-client';
import { fileLine, rowName, unmatchedWhy } from './import-labels';

/**
 * Import done (spec 9.11, board W17): "34 cards added", the copies, [Go to my inventory] and
 * "Import another file", and the lines that stayed out with "Add by name".
 */
@Component({
  selector: 'app-import-done',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './import-done.component.html',
  styleUrl: './import-done.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportDoneComponent {
  readonly done = input.required<{ title: string; body: string }>();
  readonly unmatched = input<readonly InventoryImportRow[]>([]);
  readonly go = output<void>();
  readonly another = output<void>();

  protected name(row: InventoryImportRow): string {
    return rowName(row);
  }

  protected line(row: InventoryImportRow): string {
    return fileLine(row);
  }

  protected why(row: InventoryImportRow): string {
    return unmatchedWhy(row);
  }
}
