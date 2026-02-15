import { ModalWrapper } from "@/components/modal-wrapper";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  itemCount: number;
  includeSubfolders?: boolean;
  isDeleting?: boolean;
  triggerRef?: React.RefObject<HTMLElement>;
}

export function DeleteConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "Delete Items",
  description,
  itemCount,
  includeSubfolders = false,
  isDeleting = false,
  triggerRef 
}: DeleteConfirmationModalProps) {
  const defaultDescription = `Are you sure you want to delete ${itemCount} item${itemCount > 1 ? 's' : ''}?${includeSubfolders ? " This will also delete all files and subfolders inside the selected folders." : ""} This action cannot be undone.`;

  return (
    <ModalWrapper open={isOpen} onOpenChange={onClose} triggerRef={triggerRef}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          {title}
        </DialogTitle>
        <DialogDescription>
          {description || defaultDescription}
        </DialogDescription>
      </DialogHeader>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={onConfirm}
          disabled={isDeleting}
        >
          {isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </ModalWrapper>
  );
}