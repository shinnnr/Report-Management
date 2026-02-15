import { useState } from "react";
import { useCreateFolder } from "@/hooks/use-folders";
import { ModalWrapper } from "@/components/modal-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface NewFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFolderId: number | null;
  triggerRef?: React.RefObject<HTMLElement>;
}

export function NewFolderModal({ isOpen, onClose, currentFolderId, triggerRef }: NewFolderModalProps) {
  const [folderName, setFolderName] = useState("");
  const createFolder = useCreateFolder(currentFolderId);

  const handleCreate = async () => {
    if (!folderName.trim()) return;

    await createFolder.mutateAsync({
      name: folderName,
      parentId: currentFolderId,
    });

    setFolderName("");
    onClose();
  };

  const handleClose = () => {
    setFolderName("");
    onClose();
  };

  return (
    <ModalWrapper open={isOpen} onOpenChange={handleClose} triggerRef={triggerRef}>
      <DialogHeader>
        <DialogTitle>Create New Folder</DialogTitle>
        <DialogDescription>Create a new folder in the current location.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="new-folder-name">Folder Name</Label>
          <Input
            id="new-folder-name"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Enter folder name"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleClose}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={createFolder.isPending}>
          {createFolder.isPending ? "Creating..." : "Create"}
        </Button>
      </div>
    </ModalWrapper>
  );
}