import { useState } from 'react';

import type { ImportRow, UpdateImportRowRequest } from '@/src/api/types';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { FormDialog } from '@/src/components/ui/FormDialog';
import { TextField } from '@/src/components/ui/TextField';
import { withCurrent } from '@/src/features/inventory/itemForm';
import { CARD_CONDITIONS, conditionLabel } from '@/src/lib/inventory';

import { plural, rowTitle } from './importLabels';

/** The copies an import row may add (the API's bounds). */
export const IMPORT_QUANTITY_MIN = 1;
export const IMPORT_QUANTITY_MAX = 9999;

export interface ImportRowEditDialogProps {
  /** The row being edited; `null` closes the dialog. */
  row: ImportRow | null;
  /** The conditions of the card's game (the six usual ones while the games are unknown). */
  conditions: readonly string[] | undefined;
  busy?: boolean;
  /** Saves what changed (nothing changed: closes). */
  onSave: (row: ImportRow, patch: UpdateImportRowRequest) => void;
  onClose: () => void;
}

/** What a typed number of copies must be; `null` when it is fine. */
export function quantityError(text: string): string | null {
  const value = Number(text);
  if (!/^\d+$/.test(text) || value < IMPORT_QUANTITY_MIN) {
    return 'At least 1 copy.';
  }
  return value > IMPORT_QUANTITY_MAX ? 'At most 9,999 copies.' : null;
}

/**
 * The fields of an import row that changed: its condition, its copies. Copies typed back to what
 * the file says are sent as `null` (the row follows the file and its deck sections again).
 */
export function rowPatch(
  row: Pick<ImportRow, 'condition' | 'quantity' | 'fileQuantity' | 'quantityEdited' | 'deck'>,
  draft: { condition: string; quantity: number }
): UpdateImportRowRequest {
  const patch: UpdateImportRowRequest = {};
  if (draft.condition && draft.condition !== row.condition) {
    patch.condition = draft.condition;
  }
  if (draft.quantity !== row.quantity) {
    // A deck row follows its sections while nobody typed its copies; a typed number is kept.
    patch.quantity =
      row.quantityEdited && !row.deck && draft.quantity === row.fileQuantity
        ? null
        : draft.quantity;
  }
  return patch;
}

/**
 * The condition and the copies of an import row (a form dialog: its fields stay above the
 * keyboard). The condition a file did not name is the lowest grade of the game until the collector
 * says otherwise, and the dialog says so.
 */
export function ImportRowEditDialog({
  row,
  conditions,
  busy = false,
  onSave,
  onClose,
}: ImportRowEditDialogProps) {
  if (!row) {
    return null;
  }
  return (
    <Fields
      key={row.id}
      row={row}
      conditions={conditions}
      busy={busy}
      onSave={onSave}
      onClose={onClose}
    />
  );
}

function Fields({
  row,
  conditions,
  busy,
  onSave,
  onClose,
}: Required<Pick<ImportRowEditDialogProps, 'onSave' | 'onClose'>> & {
  row: ImportRow;
  conditions: readonly string[] | undefined;
  busy: boolean;
}) {
  const [condition, setCondition] = useState(row.condition ?? '');
  const [quantity, setQuantity] = useState(String(row.quantity));
  const [error, setError] = useState<string | null>(null);
  const options = withCurrent(conditions?.length ? conditions : CARD_CONDITIONS, condition);

  const save = () => {
    const problem = quantityError(quantity);
    setError(problem);
    if (problem) {
      return;
    }
    const patch = rowPatch(row, { condition, quantity: Number(quantity) });
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    onSave(row, patch);
  };

  return (
    <FormDialog
      visible
      title={rowTitle(row)}
      message={
        row.conditionSource === 'DEFAULT'
          ? 'Your file does not say the condition of this card. It starts at the lowest grade, so it never promises more than the card is: set the right one.'
          : undefined
      }
      confirmLabel="Save"
      busy={busy}
      onConfirm={save}
      onCancel={onClose}
      testID="import-row-dialog"
    >
      <ChoiceChips
        label="Condition"
        options={options.map((value) => ({ value, label: conditionLabel(value) }))}
        value={condition}
        onChange={setCondition}
        disabled={busy}
        testID="import-row-condition"
      />
      <TextField
        label="Copies"
        value={quantity}
        onChangeText={(text) => {
          setQuantity(text.replace(/[^\d]/g, ''));
          setError(null);
        }}
        keyboardType="number-pad"
        maxLength={4}
        error={error}
        hint={
          row.fileQuantity > 0
            ? `Your file says ${plural(row.fileQuantity, 'copy', 'copies')}.`
            : undefined
        }
        editable={!busy}
        testID="import-row-quantity"
      />
    </FormDialog>
  );
}
