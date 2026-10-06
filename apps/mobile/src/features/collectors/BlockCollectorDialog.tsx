import { messageOf } from '@/src/api/errorMessages';
import { useBlockUser, useUnblockUser } from '@/src/api/hooks/blocks';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { useSnackbar } from '@/src/components/ui/Snackbar';

export interface BlockTarget {
  id: string;
  displayName: string;
}

export interface BlockCollectorDialogProps {
  /** The collector to block, or null while the dialog is closed. */
  target: BlockTarget | null;
  onClose: () => void;
  /** Called after a successful block (the parent refreshes what it shows). */
  onBlocked?: (target: BlockTarget) => void;
  testID?: string;
}

/**
 * The block confirmation (the same wording everywhere: the conversation menu, the profile, the
 * safety notice on offers and trades): `POST /users/{id}/block`, a snackbar, and the parent's
 * follow-up. Blocking hides both collectors from each other on the map, in search, in the
 * community and in messages; the blocked collector is not told.
 */
export function BlockCollectorDialog({
  target,
  onClose,
  onBlocked,
  testID = 'block-dialog',
}: BlockCollectorDialogProps) {
  const block = useBlockUser();
  const snackbar = useSnackbar();
  const name = target?.displayName ?? 'this collector';

  const confirm = async () => {
    if (!target) {
      return;
    }
    try {
      await block.mutateAsync({ id: target.id });
      onClose();
      snackbar.show(`${target.displayName} is blocked.`);
      onBlocked?.(target);
    } catch (error) {
      onClose();
      snackbar.show(messageOf(error), { tone: 'error', duration: 6000 });
    }
  };

  return (
    <ConfirmDialog
      visible={target !== null}
      title={`Block ${name}?`}
      message="You will stop seeing each other on the map, in search and in the community, and neither of you can send messages. They are not told. You can unblock them from their profile or from Settings → Blocked users."
      confirmLabel="Block"
      tone="danger"
      busy={block.isPending}
      onConfirm={() => void confirm()}
      onCancel={onClose}
      testID={testID}
    />
  );
}

/** Unblock with a snackbar (the profile's Unblock button). */
export function useUnblockCollector() {
  const unblock = useUnblockUser();
  const snackbar = useSnackbar();
  return {
    pending: unblock.isPending,
    unblock: async (target: BlockTarget): Promise<boolean> => {
      try {
        await unblock.mutateAsync({ id: target.id });
        snackbar.show(`${target.displayName} is unblocked.`);
        return true;
      } catch (error) {
        snackbar.show(messageOf(error), { tone: 'error', duration: 6000 });
        return false;
      }
    },
  };
}
