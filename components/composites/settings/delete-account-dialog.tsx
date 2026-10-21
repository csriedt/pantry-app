import { TypeToConfirm } from "@/components/composites/type-to-confirm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// #region TYPES
interface DeleteAccountDialogProperties {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isRequesting: boolean;
  onConfirm: () => void;
}
// #endregion

export const DeleteAccountDialog = (props: DeleteAccountDialogProperties) => {
  // #region CONSTANTS
  const { open, onOpenChange, isRequesting, onConfirm } = props;
  // #endregion

  // #region VIEW
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete account</DialogTitle>
          <DialogDescription>
            Your pantry, meals, and history are purged after a 7-day grace
            period. You can cancel anytime before then.
          </DialogDescription>
        </DialogHeader>
        <TypeToConfirm
          label="Type DELETE to confirm"
          word="DELETE"
          actionLabel={isRequesting ? "Requesting…" : "Delete account"}
          disabled={isRequesting}
          onConfirm={onConfirm}
        />
        <DialogFooter>
          <DialogClose
            render={<Button variant="secondary" disabled={isRequesting} />}
          >
            Cancel
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  // #endregion
};
